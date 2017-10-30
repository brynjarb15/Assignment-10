import express from 'express';
import bodyParser from 'body-parser';
import { User, Company, Punch } from './entities.js';
import uuidv4 from 'uuid/v4';
import { userTopic, punchTopic, discountTopic } from './mqTopics';

export default (db, userMq, punchMq, discountMq) => {
	var app = express();
	app.use(bodyParser.json());

	var TOKEN = 'Admin';

	app.get('/api/companies', (req, res) => {
		Company.find({}).exec((err, data) => {
			if (err) {
				res.statusCode = 500;
				return res.send('Internal server error!');
			}
			const filteredData = data.map(company => ({
				_id: company._id,
				name: company.name,
				punchCount: company.punchCount
			}));
			res.json(filteredData);
		});
	});

	// Gets a specific company, given a valid id
	app.get('/api/companies/:id', (req, res) => {
		const id = req.params.id;
		Company.findOne(
			{ _id: id },
			{ name: 1, punchCount: 1 }
		).exec((err, data) => {
			if (data === null && err == null) {
				res.statusCode = 404;
				return res.send('Company not found!');
			} else if (err) {
				res.statusCode = 500;
				return res.send('Error when finding company!');
			} else {
				res.statusCode = 200;
				return res.send(data);
			}
		});
	});

	// Registers a new company to the punchcard.com service
	app.post('/api/companies', (req, res) => {
		if (req.headers.authorization !== TOKEN) {
			res.statusCode = 401;
			return res.send('Not allowed');
		}
		if (!req.body.hasOwnProperty('name') || req.body.name === '') {
			res.statusCode = 412;
			return res.send('Precondition failed');
		}
		var newCompany = {
			name: req.body.name,
			punchCount: req.body.punchCount
		};
		new Company(newCompany).save(err => {
			if (err) {
				res.statusCode = 412;
				return res.send('Precondition failed');
			} else {
				res.statusCode = 201;
				return res.send({
					id: Company(newCompany)._id
				});
			}
		});
	});

	// Gets all users in the system
	app.get('/api/users', (req, res) => {
		// Get all the users
		User.find({}).exec((err, users) => {
			if (err) {
				res.status(500).json({ error: 'Failed to get users' });
			} else {
				// We only want to return id, name and gender, not the token
				const filteredUsers = users.map(user => ({
					id: user._id,
					name: user.name,
					gender: user.gender
				}));
				return res.json(filteredUsers);
			}
		});
	});

	// Creates a new user in the system
	app.post('/api/users', (req, res) => {
		const { name, gender } = req.body;
		// Authorization and error check
		if (req.headers.authorization !== TOKEN) {
			res.status(401).json();
		} else if (!req.body.hasOwnProperty('name') || !name.length) {
			res.status(412).json({ error: 'User must have a name' });
		} else if (!req.body.hasOwnProperty('gender') || !gender.length) {
			res.status(412).json({ error: 'User must have an gender' });
		} else if (!(gender === 'm' || gender === 'f' || gender === 'o')) {
			res.status(412).json({ error: "Gender must be 'm', 'f' or 'o' " });
		} else {
			// Use uuidv4 to make a token for the user
			var userToken = uuidv4();
			new User({ name, token: userToken, gender }).save((err, user) => {
				if (err) {
					res
						.status(500)
						.json({ error: 'Failed to save to database' });
				} else {
					// Only return the token of the new user to the client
					const { token, name, gender, _id } = user;
					userMq.sendToQueue(
						userTopic,
						new Buffer(
							JSON.stringify({
								name,
								gender,
								id: _id,
								date: new Date()
							})
						)
					);
					res.json({ token });
				}
			});
		}
	});

	app.post('/api/my/punches', function(req, res) {
		const token = req.headers.authorization;
		const companyId = req.body.companyId;
		if (!token) {
			res.statusCode = 400;
			return res.send('Bad Request');
		}
		if (!companyId) {
			res.statusCode = 404;
			return res.send('Not Found');
		}
		let _userId;
		let _lastPunch;
		let _punchCount;
		isValidCompany(companyId)
			.then(isValid => {
				if (!isValid) {
					throw new Error('CompanyNotValid');
				} else {
					return isValid;
				}
			})
			.then(isValid => {
				return getUserIdByToken(token);
			})
			.then(userId => {
				if (!userId) {
					throw new Error('UserNotFound');
				} else {
					_userId = userId;
					return savePunchToDatabase(companyId, userId);
				}
			})
			.then(punchId => {
				return addPunchToMessageQueue(punchId);
			})
			.then(punchId => {
				_lastPunch = punchId;
				return getPunchCountByCompanyId(companyId);
			})
			.then(punchCount => {
				if (!punchCount) {
					throw new Error('PunchCountNotFound');
				} else {
					_punchCount = punchCount;
					return getTotalUnusedPunches(companyId, _userId);
				}
			})
			.then(totalUnusedPunches => {
				if (!totalUnusedPunches) {
					throw new Error('TotalUnusedPunchesNotFound');
				} else {
					if (totalUnusedPunches === _punchCount) {
						return Punch.update(
							{
								company_id: companyId,
								user_id: _userId,
								used: false
							},
							{ used: true },
							{ multi: true },
							() => {
								//addDiscountToMessageQueue(companyId, userId);
								return res.status(200).json({ Discount: true });
							}
						);
					} else {
						return res.status(201).json({ id: _lastPunch });
					}
				}
			})
			.catch(err => {
				if (err.message === 'CompanyNotValid') {
					res.statusCode = 404;
					return res.send('Not Found');
				} else if (err.message === 'UserNotFound') {
					res.statusCode = 401;
					res.send('User not found');
				} else if (err.message === 'PunchCountNotFound') {
					res.statusCode = 404;
					res.send('punchCount not found');
				} else if (err.message === 'TotalUnusedPunchesNotFound') {
					res.statusCode = 404;
					res.send('punchCount not found');
				} else {
					res.statusCode = 500;
					return res.send(err.message);
				}
			});
	});

	// Helper functions
	function getUserIdByToken(token) {
		return User.findOne({ token: token }, '_id').then(data => {
			if (data) {
				return data._id;
			} else {
				return null;
			}
		});
	}

	function isValidCompany(companyId) {
		return Company.findOne({ _id: companyId }, '_id').then(data => {
			if (data) {
				return true;
			} else {
				return false;
			}
		});
	}

	function getPunchCountByCompanyId(companyId) {
		return Company.findOne({ _id: companyId }, 'punchCount').then(data => {
			if (data) {
				return data.punchCount;
			} else {
				return null;
			}
		});
	}

	function getTotalUnusedPunches(companyId, userId) {
		return Punch.count({
			company_id: companyId,
			user_id: userId,
			used: false
		}).then(number => {
			if (number || number === 0) {
				return number;
			} else {
				return null;
			}
		});
	}

	function savePunchToDatabase(companyId, userId) {
		const newPunch = new Punch({
			company_id: companyId,
			user_id: userId,
			created: new Date(),
			used: false
		});
		return newPunch.save().then(punch => {
			return punch._id;
		});
	}
	function getUserNameByUserId(userId) {
		return User.findOne({ _id: userId }).then(user => {
			if (user) {
				let userName = user.name;
				return userName;
			} else {
				return null;
			}
		});
	}

	function getCompanyByCompanyId(companyId) {
		return Company.findOne({ _id: companyId }).then(company => {
			if (company) {
				return company;
			} else {
				return null;
			}
		});
	}

	function getPunchByPunchId(punchId) {
		return Punch.findOne({ _id: punchId }).then(punch => {
			if (punch) {
				return punch;
			} else {
				return null;
			}
		});
	}

	function addPunchToMessageQueue(punchId) {
		let userName; //
		let userId; //
		let companyName; //
		let companyId; //
		let companyPunchCount; //
		let dateOfPunch; //
		let unusedPunches; //
		getPunchByPunchId(punchId)
			.then(punch => {
				userId = punch.user_id;
				companyId = punch.company_id;
				dateOfPunch = punch.created;
				return getUserNameByUserId(userId);
			})
			.then(uName => {
				userName = uName;
				return getCompanyByCompanyId(companyId);
			})
			.then(company => {
				companyName = company.name;
				companyPunchCount = company.punchCount;
				return getTotalUnusedPunches(companyId, userId);
			})
			.then(unPunches => {
				unusedPunches = unPunches;
				// Add the punch to the message queue
				punchMq.sendToQueue(
					punchTopic,
					new Buffer(
						JSON.stringify({
							userName, //Name of user
							userId, // ID of user
							companyName, // Name of the company
							companyId, // ID of the company
							companyPunchCount, // punch count of the company
							dateOfPunch, // date when punch was made
							unusedPunches // How many unused punches user has
						})
					)
				);
				return punchId;
			})
			.then(() => {
				addDiscountToMessageQueue(
					userName,
					userId,
					companyName,
					companyId,
					companyPunchCount,
					dateOfPunch,
					unusedPunches
				);
			});
		return punchId;
	}

	function addDiscountToMessageQueue(
		userName,
		userId,
		companyName,
		companyId,
		companyPunchCount,
		dateOfPunch,
		unusedPunches
	) {
		// Discount was given and there are no unused punches
		if (unusedPunches === 0) {
			discountMq.sendToQueue(
				discountTopic,
				new Buffer(
					JSON.stringify({
						userName, //Name of user
						userId, // ID of user
						companyName, // Name of the company
						companyId, // ID of the company
						companyPunchCount, // punch count of the company
						dateOfPunch // date when punch was made
					})
				)
			);
		}
	}
	return app;
};

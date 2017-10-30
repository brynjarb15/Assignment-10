import mongoose, { Schema } from 'mongoose';

export const User = mongoose.model(
	'user',
	Schema({
		name: String,
		token: String,
		gender: String
	})
);

export const Company = mongoose.model(
	'company',
	Schema({
		name: String,
		punchCount: {
			type: Number,
			default: 10
		}
	})
);

export const Punch = mongoose.model(
	'punch',
	Schema({
		company_id: String,
		user_id: String,
		created: Date,
		used: Boolean
	})
);

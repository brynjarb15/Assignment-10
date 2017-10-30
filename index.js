/*
	In order for this to successfully run, there are 3 steps that need to be taken
	  1. npm install
	  2. yarn start

	After that the server runs on http://localhost:3000
*/

import express from 'express';
import bodyParser from 'body-parser';
import mongoose from 'mongoose';
import app from './api.js';
import createProducer from './producer';
import { userTopic, punchTopic, discountTopic } from './mqTopics';
console.log('starting');
mongoose.Promise = global.Promise;
const mongoConnection = mongoose.connect(
	'mongodb://verkefni-8:verkefni-8@ds121575.mlab.com:21575/verkefni-8',
	{
		useMongoClient: true
	}
);

const userProducer = createProducer(userTopic);
const punchProducer = createProducer(punchTopic);
const discountProducer = createProducer(discountTopic);

Promise.all([
	mongoConnection,
	userProducer,
	punchProducer,
	discountProducer
]).then(([db, userMq, punchMq, discountMq]) => {
	console.log('index.js');
	const server = app(db, userMq, punchMq, discountMq);
	server.listen(3000, () => console.log('Listening on port 3000'));
});

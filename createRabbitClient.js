import amqplib from 'amqplib';

export default () =>
	new Promise((resolve, reject) => {
		amqplib
			.connect('amqp://localhost')
			.then(conn => conn.createChannel())
			.then(ch => resolve(ch));
	});

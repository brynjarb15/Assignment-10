import CreateRabbitClient from './createRabbitClient';
import { userTopic, punchTopic, discountTopic } from './mqTopics';

console.log('consumer.js');
CreateRabbitClient().then(ch =>
	ch.assertQueue(userTopic).then(ok => {
		return ch.consume(userTopic, msg => {
			if (msg !== null) {
				console.log('User was added');
				console.log(msg.content.toString());
				/*const data = JSON.parse(msg.content.toString());
				console.log(
					'User  created with\n name: ',
					data.name,
					'\n gender: ',
					data.gender,
					'\n id: ',
					data.id,
					'\n date',
					data.date
				);*/
				ch.ack(msg);
			}
		});
	})
);

CreateRabbitClient().then(ch =>
	ch.assertQueue(punchTopic).then(ok => {
		return ch.consume(punchTopic, punchMsg => {
			if (punchMsg !== null) {
				console.log('User got a punch');
				console.log(punchMsg.content.toString());
				ch.ack(punchMsg);
			}
		});
	})
);

CreateRabbitClient().then(ch =>
	ch.assertQueue(discountTopic).then(ok => {
		return ch.consume(discountTopic, msg => {
			if (msg !== null) {
				console.log('User got discount');
				console.log(msg.content.toString());
				ch.ack(msg);
			}
		});
	})
);

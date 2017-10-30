import CreateRabbitClient from './createRabbitClient';

export default topic =>
	new Promise((resolve, rejcet) => {
		CreateRabbitClient().then(ch => {
			ch.assertQueue(topic).then(ok => {
				resolve(ch);
			});
		});
	});

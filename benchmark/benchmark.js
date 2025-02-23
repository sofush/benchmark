import net from 'node:net'
import fs from 'node:fs/promises'

const benchmark = async (buffer) => {
	console.log('Connecting to server...');

	const client = net.createConnection({ port: 5678 }, async _ => {
		console.log('Connected to server.');
		client.write(buffer);
		client.end();
	});

	const file = await fs.open('output.bmp', 'w');

	client.on('data', async data => {
		await file.write(data);
	});

	client.on('end', _ => {
		file.close();
		console.log('Disconnected from server.');
	});
};

export default benchmark;

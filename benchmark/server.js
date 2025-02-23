import express from 'express'
import { JimpMime } from 'jimp'

const app = express();
const port = 3000;

const image = await Jimp.read('input.jpg');
const buffer = await image.getBuffer(JimpMime.bmp);

const client = net.createConnection({ port: 5678 }, async _ => {
	console.log('Connected to server.');
	client.write(buffer);
	client.end();
});

app.get('/', (_req, res) => {
	res.send('Hello World!')
});

app.listen(port, () => {
	console.log(`Example app listening on port ${port}`)
});

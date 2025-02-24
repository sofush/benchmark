import express from 'express'
import ws from 'express-ws'
import morgan from 'morgan';

// const image = await Jimp.read('input.jpg');
// const buffer = await image.getBuffer(JimpMime.bmp);

// const client = net.createConnection({ port: 5678 }, async _ => {
// 	console.log('Connected to server.');
// 	client.write(buffer);
// 	client.end();
// });

const app = express();
const port = 3000;

ws(app);

app.use(morgan('combined'));

app.use('/public', express.static('public'))

app.get('/', (_req, res) => {
	res.sendFile('index.html', { root: 'public' })
});

app.ws('/websocket', (ws, _req) => {
	ws.on('message', msg => {
		console.log(msg);
	});

	ws.on('disconnect', msg => {
		console.log(msg);
	});
});


app.listen(port, () => {
	console.log(`Example app listening on port ${port}`)
});

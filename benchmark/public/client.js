const connectWebsocket = () => {
	const https = window.location.protocol === "https:";
	const uri = `${https ? 'wss:' : 'ws:'}//${window.location.host}/websocket`
	console.log(`Connecting to websocket at: ${uri}`)

	return new Promise((resolve, reject) => {
		const ws = new WebSocket(uri);

		ws.onopen = () => {
			resolve(ws);
		};

		ws.onerror = (err) => {
			reject(err);
		};
	});
};

document.addEventListener('DOMContentLoaded', async _ => {
	let ws = null;

	try {
		ws = await connectWebsocket()
	} catch (e) {
		console.error(`Could not connect to websocket: ${e}`);
		return;
	}

	const ctx = document.getElementById('chart');

	new Chart(ctx, {
		type: 'bar',
		data: {
			labels: ['Rust', 'Python', 'Python med numpy'],
			datasets: [{
				label: 'Gennemsnitlig tid',
				data: [28.4, 70.3, 5000],
				borderWidth: 1
			}]
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			scales: {
				y: {
					beginAtZero: true
				}
			},
		}
	});
});

import net from 'node:net';

const services = process.argv.slice(2);

if (services.length === 0) {
	console.error('Usage: node scripts/wait-for-services.mjs host:port [host:port ...]');
	process.exit(1);
}

const timeoutMs = Number.parseInt(process.env.WAIT_FOR_TIMEOUT_MS ?? '180000', 10);
const intervalMs = Number.parseInt(process.env.WAIT_FOR_INTERVAL_MS ?? '1000', 10);
const connectTimeoutMs = Number.parseInt(process.env.WAIT_FOR_CONNECT_TIMEOUT_MS ?? '2000', 10);

const invalidServices = services.filter((service) => !/^[^:]+:\d+$/.test(service));

if (invalidServices.length > 0) {
	console.error(`Invalid service definitions: ${invalidServices.join(', ')}`);
	process.exit(1);
}

function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function connect(host, port) {
	return new Promise((resolve, reject) => {
		const socket = net.createConnection({host, port});

		const cleanup = () => {
			socket.removeAllListeners();
			socket.destroy();
		};

		const timer = setTimeout(() => {
			cleanup();
			reject(new Error('connect timeout'));
		}, connectTimeoutMs);

		socket.once('connect', () => {
			clearTimeout(timer);
			cleanup();
			resolve();
		});

		socket.once('error', (error) => {
			clearTimeout(timer);
			cleanup();
			reject(error);
		});
	});
}

async function waitForService(service) {
	const [host, portString] = service.split(':');
	const port = Number.parseInt(portString, 10);
	const deadline = Date.now() + timeoutMs;
	let lastError = null;

	console.log(`Waiting for ${service}...`);

	while (Date.now() < deadline) {
		try {
			await connect(host, port);
			console.log(`Connected to ${service}`);
			return;
		} catch (error) {
			lastError = error;
			await delay(intervalMs);
		}
	}

	const reason = lastError instanceof Error ? lastError.message : String(lastError);
	throw new Error(`Timed out waiting for ${service}: ${reason}`);
}

try {
	await Promise.all(services.map((service) => waitForService(service)));
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
}

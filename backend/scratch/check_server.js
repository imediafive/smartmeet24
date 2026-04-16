
import { NodeSSH } from 'node-ssh';

const ssh = new NodeSSH();

async function checkServer() {
    try {
        await ssh.connect({
            host: 'YOUR_SERVER_IP',
            username: 'root',
            password: 'YOUR_SERVER_PASSWORD'
        });

        console.log('Connected to server!');

        const commands = [
            'pm2 status',
            'tail -n 50 /root/.pm2/logs/backend-error.log',
            'tail -n 50 /root/.pm2/logs/backend-out.log'
        ];

        for (const cmd of commands) {
            console.log(`\n--- Running: ${cmd} ---`);
            const result = await ssh.execCommand(cmd);
            console.log(result.stdout || result.stderr);
        }

        ssh.dispose();
    } catch (err) {
        console.error('SSH Error:', err);
    }
}

checkServer();

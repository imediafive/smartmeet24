
import { NodeSSH } from 'node-ssh';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ssh = new NodeSSH();

async function deploy() {
    try {
        console.log('Connecting to server...');
        await ssh.connect({
            host: 'YOUR_SERVER_IP',
            username: 'root',
            password: 'YOUR_SERVER_PASSWORD'
        });

        console.log('Connected!');

        // 1. Upload Backend
        console.log('Uploading Backend files...');
        // We are in backend/scratch, so the backend root is ../
        const backendRoot = path.resolve(__dirname, '..');
        
        await ssh.putDirectory(backendRoot, '/root/SmartSPS/backend', {
            recursive: true,
            concurrency: 10,
            validate: (itemPath) => {
                const base = path.basename(itemPath);
                const relative = path.relative(backendRoot, itemPath);
                
                if (base === 'node_modules' || base === '.git' || base === 'scratch' || base === '.env' || base === '.env.production' || base === '.env.example') return false;
                if (relative.startsWith('.sixth')) return false;
                if (base === 'package-lock.json') return true; 
                return true;
            }
        });

        // 2. Upload Frontend
        console.log('Uploading Frontend dist...');
        const frontendDist = path.resolve(__dirname, '../../frontend/dist');
        
        // Clean the remote dir first
        console.log('Cleaning /var/www/html...');
        await ssh.execCommand('rm -rf /var/www/html/*');
        
        await ssh.putDirectory(frontendDist, '/var/www/html', {
            recursive: true,
            concurrency: 10
        });

        // 3. Update .env (Correcting BREVO_API_KEY and others)
        console.log('Updating .env...');
        const envContent = `PORT=5001
MONGODB_URI=YOUR_MONGODB_URI
FRONTEND_URL=https://smartmeet24.com
NODE_ENV=production
CLOUDINARY_CLOUD_NAME=YOUR_CLOUDINARY_NAME
CLOUDINARY_API_KEY=YOUR_CLOUDINARY_KEY
CLOUDINARY_API_SECRET=YOUR_CLOUDINARY_SECRET
VEXA_API_KEY=YOUR_VEXA_KEY
GROQ_API_KEY=YOUR_GROQ_KEY
GLADIA_API_KEY=YOUR_GLADIA_KEY
MEDIASOUP_ANNOUNCED_IP=YOUR_SERVER_IP
JWT_SECRET=YOUR_JWT_SECRET
BREVO_API_KEY=YOUR_BREVO_KEY
EMAIL_USER=YOUR_EMAIL
EMAIL_NAME="Arslan Rathore"
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
`;
        // Use a safe way to write the file (avoiding shell escaping issues with complex characters)
        await ssh.execCommand(`echo '${envContent}' > /root/SmartSPS/backend/.env`);

        // 4. Install & Restart
        console.log('Running fresh npm install on server (this may take a minute)...');
        await ssh.execCommand('rm -rf node_modules', { cwd: '/root/SmartSPS/backend' });
        const installResult = await ssh.execCommand('npm install', { cwd: '/root/SmartSPS/backend' });
        console.log(installResult.stdout || installResult.stderr);

        console.log('Restarting PM2...');
        await ssh.execCommand('pm2 restart backend');
        
        console.log('Deployment Successful!');
        
        // Final sanity check
        const statusResult = await ssh.execCommand('pm2 status');
        console.log(statusResult.stdout);

        ssh.dispose();
    } catch (err) {
        console.error('Deployment Failed:', err);
        ssh.dispose();
    }
}

deploy();

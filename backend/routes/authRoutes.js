import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import authMiddleware from '../middleware/authMiddleware.js';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import streamifier from 'streamifier';
import nodemailer from 'nodemailer';

const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();

// Brevo API Email Helper
const sendEmail = async ({ to, subject, html }) => {
    try {
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': process.env.BREVO_API_KEY,
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                sender: { name: process.env.EMAIL_NAME, email: process.env.EMAIL_USER },
                to: [{ email: to }],
                subject: subject,
                htmlContent: html
            })
        });

        const result = await response.json();
        if (!response.ok) {
            console.error('[BREVO] API Error:', result);
            throw new Error(result.message || 'Failed to send email via Brevo API');
        }
        return result;
    } catch (err) {
        console.error('[BREVO] Request failed:', err);
        throw err;
    }
};

// Register (Step 1: Create unverified user and send code)
router.post('/register', async (req, res) => {
    try {
        const { email, password, name } = req.body;
        if (!email || !password || !name) {
            return res.status(400).json({ error: 'Name, email and password are required' });
        }

        const normalizedEmail = email.toLowerCase().trim();
        let user = await User.findOne({ email: normalizedEmail });
        
        if (user && user.isVerified) {
            return res.status(400).json({ error: 'An account with this email already exists' });
        }

        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        const verificationCodeExpires = Date.now() + 600000; // 10 minutes

        if (user) {
            user.password = password;
            user.name = name.trim();
            user.verificationCode = verificationCode;
            user.verificationCodeExpires = verificationCodeExpires;
            await user.save();
        } else {
            user = new User({ 
                email: normalizedEmail, 
                password, 
                name: name.trim(),
                isVerified: false,
                verificationCode,
                verificationCodeExpires
            });
            await user.save();
        }

        await sendEmail({
            to: user.email,
            subject: 'Verification Code - Smart Meet',
            html: `
                <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px; max-width: 500px; margin: auto;">
                    <h2 style="color: #6366f1;">Welcome to Smart Meet!</h2>
                    <p>To complete your registration, please enter the following verification code:</p>
                    <h1 style="background: #f3f4f6; padding: 10px; text-align: center; color: #6366f1; letter-spacing: 5px; border-radius: 8px;">${verificationCode}</h1>
                    <p style="color: #6b7280; font-size: 14px;">This code will expire in 10 minutes.</p>
                </div>
            `
        });

        res.status(200).json({ message: 'Verification code sent' });
    } catch (err) {
        console.error('[AUTH] Registration error:', err);
        res.status(500).json({ error: `Registration initiation failed: ${err.message}` });
    }
});

// Verify Signup Code
router.post('/verify-signup', async (req, res) => {
    try {
        const { email, code } = req.body;
        const user = await User.findOne({ 
            email: email.toLowerCase().trim(),
            verificationCode: code,
            verificationCodeExpires: { $gt: Date.now() }
        });

        if (!user) return res.status(400).json({ error: 'Invalid or expired verification code' });

        user.isVerified = true;
        user.verificationCode = null;
        user.verificationCodeExpires = null;
        await user.save();

        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '30d' });
        res.status(201).json({ token, user: { id: user._id, email: user.email, name: user.name, avatar: user.avatar } });
    } catch (err) {
        console.error('[AUTH] Verification error:', err);
        res.status(500).json({ error: 'Verification failed' });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password, rememberMe } = req.body;
        const user = await User.findOne({ email: email.toLowerCase().trim() });
        
        if (!user || !(await user.comparePassword(password))) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        if (!user.isVerified) {
            const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
            user.verificationCode = verificationCode;
            user.verificationCodeExpires = Date.now() + 600000;
            await user.save();

            await sendEmail({
                to: user.email,
                subject: 'Verification Code - Smart Meet',
                html: `
                    <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px; max-width: 500px; margin: auto;">
                        <h2 style="color: #6366f1;">Email Verification Required</h2>
                        <p>It looks like your account is not verified yet. A new code is:</p>
                        <h1 style="background: #f3f4f6; padding: 10px; text-align: center; color: #6366f1; letter-spacing: 5px; border-radius: 8px;">${verificationCode}</h1>
                        <p style="color: #6b7280; font-size: 14px;">This code will expire in 10 minutes.</p>
                    </div>
                `
            });

            return res.status(403).json({ 
                error: 'Please verify your email to log in. A new code has been sent.',
                requiresVerification: true,
                email: user.email 
            });
        }

        const expires = rememberMe ? '30d' : '7d';
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: expires });
        res.json({ token, user: { id: user._id, email: user.email, name: user.name, avatar: user.avatar } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get current user
router.get('/me', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'No token' });
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
        const user = await User.findById(decoded.userId).select('-password');
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ id: user._id, email: user.email, name: user.name, avatar: user.avatar });
    } catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
});

// Admin ONLY: Get all registered users
router.get('/admin/users', authMiddleware, async (req, res) => {
    try {
        const userId = req.auth.userId;
        const reqUser = await User.findById(userId);
        if (!reqUser || reqUser.email !== 'admin@gmail.com') return res.status(403).json({ error: 'Access denied.' });
        const users = await User.find({}).select('-password').sort({ createdAt: -1 });
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: 'Failed' });
    }
});

// Update profile
router.put('/profile', authMiddleware, upload.single('avatar'), async (req, res) => {
    try {
        const userId = req.auth.userId;
        const file = req.file;
        if (!file) return res.status(400).json({ error: 'No file' });
        cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET });
        const result = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream({ folder: 'smartsps/avatars' }, (err, res) => err ? reject(err) : resolve(res));
            streamifier.createReadStream(file.buffer).pipe(uploadStream);
        });
        const user = await User.findByIdAndUpdate(userId, { avatar: result.secure_url }, { new: true }).select('-password');
        res.json({ id: user._id, email: user.email, name: user.name, avatar: user.avatar });
    } catch (err) {
        res.status(500).json({ error: 'Failed' });
    }
});

// --- PASSWORD RESET ---
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) return res.status(404).json({ error: 'Not found' });
        const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
        user.resetCode = resetCode;
        user.resetCodeExpires = Date.now() + 600000;
        await user.save();
        await sendEmail({
            to: user.email,
            subject: 'Reset Code',
            html: `<h1>${resetCode}</h1>`
        });
        res.json({ message: 'Sent' });
    } catch (err) {
        res.status(500).json({ error: 'Failed' });
    }
});

router.post('/reset-password', async (req, res) => {
    try {
        const { email, code, newPassword } = req.body;
        const user = await User.findOne({ email: email.toLowerCase(), resetCode: code, resetCodeExpires: { $gt: Date.now() } });
        if (!user) return res.status(400).json({ error: 'Invalid code' });
        user.password = newPassword;
        user.resetCode = null;
        user.resetCodeExpires = null;
        await user.save();
        res.json({ message: 'Success' });
    } catch (err) {
        res.status(500).json({ error: 'Failed' });
    }
});

export default router;

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../../middleware/authenticate';
import { SubscriptionsRepository } from '../subscriptions/subscriptions.repository';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';

// Brute-force protection on login: max 5 requests per 15 minutes per IP
// In test mode, limit is raised to avoid interference with integration tests
const bruteForceLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'test' ? 10000 : 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many login attempts. Please try again in 15 minutes.',
  },
});

// Account creation abuse protection: max 5 registrations per 15 minutes per IP.
// Without this limit, anyone can script thousands of account creations, exhausting
// DB capacity and trial subscription slots.
const registerLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'test' ? 10000 : 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many registration attempts. Please try again later.',
  },
});

// Token refresh rate limit: prevents enumeration of valid tokens.
// 30 renewals per 15 min per IP is generous for legitimate users.
const refreshLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many token refresh attempts. Please try again later.',
  },
});

const repo = new AuthRepository();
const subscriptionsRepo = new SubscriptionsRepository();
const service = new AuthService(repo, subscriptionsRepo);
const controller = new AuthController(service);

export const authRouter = Router();

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication and account management
 */

/**
 * @swagger
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user
 *     description: >
 *       Creates a new customer account and starts a 7-day trial subscription.
 *       The refresh token is returned as an HttpOnly cookie (`refreshToken`) — not in the response body.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *                 example: João Silva
 *               email:
 *                 type: string
 *                 format: email
 *                 example: joao@example.com
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 example: senha123
 *     responses:
 *       201:
 *         description: User registered successfully
 *         headers:
 *           Set-Cookie:
 *             description: HttpOnly cookie containing the refresh token
 *             schema:
 *               type: string
 *               example: refreshToken=<jwt>; Path=/api/v1/auth; HttpOnly; SameSite=Strict
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       type: object
 *                     accessToken:
 *                       type: string
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: string
 *                   example: VALIDATION_ERROR
 *                 message:
 *                   type: string
 *                 errors:
 *                   type: object
 *                   additionalProperties:
 *                     type: string
 *       409:
 *         description: Email already registered
 */
authRouter.post('/register', registerLimit, controller.register.bind(controller));

/**
 * @swagger
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login with email and password
 *     description: >
 *       Authenticate and receive an access token. Rate limited to 5 attempts per 15 minutes.
 *       The refresh token is returned as an HttpOnly cookie (`refreshToken`) — not in the response body.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: joao@example.com
 *               password:
 *                 type: string
 *                 example: senha123
 *     responses:
 *       200:
 *         description: Login successful
 *         headers:
 *           Set-Cookie:
 *             description: HttpOnly cookie containing the refresh token
 *             schema:
 *               type: string
 *               example: refreshToken=<jwt>; Path=/api/v1/auth; HttpOnly; SameSite=Strict
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken:
 *                       type: string
 *       400:
 *         description: Validation error
 *       401:
 *         description: Invalid credentials
 *       429:
 *         description: Too many login attempts
 */
authRouter.post('/login', bruteForceLimit, controller.login.bind(controller));

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Refresh access token
 *     description: >
 *       Issues a new access token using the HttpOnly `refreshToken` cookie.
 *       Implements token rotation: the old refresh token is revoked and a new one is set in the cookie.
 *       No request body is needed — the refresh token is read from the cookie automatically.
 *     responses:
 *       200:
 *         description: New access token issued and new refresh token cookie set
 *         headers:
 *           Set-Cookie:
 *             description: New HttpOnly cookie with rotated refresh token
 *             schema:
 *               type: string
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken:
 *                       type: string
 *       401:
 *         description: Missing, invalid, or expired refresh token cookie
 *       429:
 *         description: Too many refresh attempts
 */
authRouter.post('/refresh', refreshLimit, controller.refresh.bind(controller));

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Logout (invalidate refresh token)
 *     description: >
 *       Invalidates the current refresh token (blacklists its jti) and clears the cookie.
 *       Requires a valid Bearer access token.
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       204:
 *         description: Logged out successfully — refresh token cookie cleared
 *       401:
 *         description: Missing or invalid Bearer token
 */
authRouter.post('/logout', authenticate, controller.logout.bind(controller));

/**
 * @swagger
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get current authenticated user
 *     description: >
 *       Returns the payload from the current access token without any database query.
 *       Useful for the frontend to quickly verify auth status and get userId/role.
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Current authenticated user payload
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     userId:
 *                       type: string
 *                       example: 550e8400-e29b-41d4-a716-446655440000
 *                     role:
 *                       type: string
 *                       example: customer
 *       401:
 *         description: Missing or invalid Bearer token
 */
authRouter.get('/me', authenticate, controller.me.bind(controller));

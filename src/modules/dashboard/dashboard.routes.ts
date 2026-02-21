import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { DashboardController } from './dashboard.controller';
import { DashboardRepository } from './dashboard.repository';
import { DashboardService } from './dashboard.service';

const repo = new DashboardRepository();
const service = new DashboardService(repo);
const controller = new DashboardController(service);

export const dashboardRouter = Router();

/**
 * @swagger
 * tags:
 *   name: Dashboard
 *   description: Customer dashboard — usage stats and profile
 */

// All dashboard routes require JWT authentication
dashboardRouter.use(authenticate);

/**
 * @swagger
 * /dashboard/usage:
 *   get:
 *     tags: [Dashboard]
 *     summary: Get usage summary for the current user
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Usage summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalTranscriptions:
 *                       type: integer
 *                     totalMinutes:
 *                       type: number
 *                     monthTranscriptions:
 *                       type: integer
 *                     monthMinutes:
 *                       type: number
 *                     tier:
 *                       type: string
 *                       nullable: true
 *                     status:
 *                       type: string
 *                       nullable: true
 *       401:
 *         description: Unauthorized
 */
dashboardRouter.get('/usage', controller.getUsage.bind(controller));

/**
 * @swagger
 * /dashboard/transcriptions:
 *   get:
 *     tags: [Dashboard]
 *     summary: Get paginated transcription history
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *     responses:
 *       200:
 *         description: Paginated transcription history
 *       401:
 *         description: Unauthorized
 */
dashboardRouter.get('/transcriptions', controller.getTranscriptions.bind(controller));

/**
 * @swagger
 * /dashboard/profile:
 *   get:
 *     tags: [Dashboard]
 *     summary: Get user profile
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: User profile with subscription info
 *       401:
 *         description: Unauthorized
 */
dashboardRouter.get('/profile', controller.getProfile.bind(controller));

/**
 * @swagger
 * /dashboard/profile:
 *   patch:
 *     tags: [Dashboard]
 *     summary: Update user profile
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Profile updated
 *       400:
 *         description: At least one field must be provided
 *       401:
 *         description: Unauthorized
 */
dashboardRouter.patch('/profile', controller.updateProfile.bind(controller));

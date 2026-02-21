import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { requireAdmin } from '../../middleware/require-admin';
import { AdminController } from './admin.controller';
import { AdminRepository } from './admin.repository';
import { AdminService } from './admin.service';

const repo = new AdminRepository();
const service = new AdminService(repo);
const controller = new AdminController(service);

export const adminRouter = Router();

// All admin routes require JWT authentication + admin role
adminRouter.use(authenticate);
adminRouter.use(requireAdmin);

/**
 * @swagger
 * /admin/users:
 *   get:
 *     summary: List all users with subscription info
 *     tags: [Admin]
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
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Filter by name or email
 *     responses:
 *       200:
 *         description: Paginated list of users
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 */
adminRouter.get('/users', controller.listUsers.bind(controller));

/**
 * @swagger
 * /admin/users/{id}:
 *   get:
 *     summary: Get user details with subscription and transcription history
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: User details
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *       404:
 *         description: User not found
 */
adminRouter.get('/users/:id', controller.getUserDetails.bind(controller));

/**
 * @swagger
 * /admin/users/{id}/subscription:
 *   patch:
 *     summary: Update subscription tier or status for a user
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               tier:
 *                 type: string
 *                 enum: [trial, basic, pro]
 *               status:
 *                 type: string
 *                 enum: [active, trial, suspended, cancelled]
 *     responses:
 *       200:
 *         description: Updated subscription
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 */
adminRouter.patch('/users/:id/subscription', controller.updateSubscription.bind(controller));

/**
 * @swagger
 * /admin/audit-log:
 *   get:
 *     summary: Get paginated audit log
 *     tags: [Admin]
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
 *     responses:
 *       200:
 *         description: Paginated audit log
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 */
adminRouter.get('/audit-log', controller.getAuditLog.bind(controller));

/**
 * @swagger
 * /admin/stats:
 *   get:
 *     summary: Get system-wide statistics
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: System stats
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalUsers:
 *                       type: integer
 *                     totalTranscriptions:
 *                       type: integer
 *                     activeSubscriptions:
 *                       type: object
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 */
adminRouter.get('/stats', controller.getStats.bind(controller));

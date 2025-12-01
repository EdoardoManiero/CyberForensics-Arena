/**
 * Device routes
 * * POST /api/devices/attach - Attach a device for a user/scenario
 * * GET /api/devices - List attached devices for current user/scenario
 * * POST /api/devices/mount - Mount a device
 * * POST /api/devices/unmount - Unmount a device
 */

import express from 'express';
import { getDb } from '../db/db.js';
import { authenticate } from '../middleware/auth.js';
import { mountDeviceContentToVFS } from '../vfs/vfs.js';

const router = express.Router();

/**
 * Attach a device for a user/scenario
 * POST /api/devices/attach
 * Body: { scenarioCode, deviceName, deviceType, size, mountContent }
 */
router.post('/attach', authenticate, async (req, res) => {
  try {
    const { scenarioCode, deviceName, deviceType, size, mountContent } = req.body;
    const userId = req.user.id || req.user.userId;

    if (!scenarioCode || !deviceName || !deviceType) {
      return res.status(400).json({ error: 'scenarioCode, deviceName, and deviceType are required' });
    }

    const db = getDb();
    
    // Generate partition name (deviceName + '1')
    const partitionName = `${deviceName}1`;
    
    // Store device data (content) as JSON
    const deviceData = mountContent || {};

    // Check if device already exists
    const existing = await db.get(`
      SELECT * FROM user_devices 
      WHERE user_id = ? AND scenario_code = ? AND device_name = ?
    `, userId, scenarioCode, deviceName);

    if (existing) {
      // Update existing device
      await db.run(`
        UPDATE user_devices 
        SET device_type = ?, size = ?, partition_name = ?, device_data = ?
        WHERE user_id = ? AND scenario_code = ? AND device_name = ?
      `, deviceType, size || '500G', partitionName, JSON.stringify(deviceData), userId, scenarioCode, deviceName);
    } else {
      // Insert new device
      await db.run(`
        INSERT INTO user_devices (
          user_id, scenario_code, device_name, device_type, size, 
          partition_name, mounted, mount_point, device_data
        )
        VALUES (?, ?, ?, ?, ?, ?, 0, NULL, ?)
      `, userId, scenarioCode, deviceName, deviceType, size || '500G', partitionName, JSON.stringify(deviceData));
    }

    // Get the device record
    const device = await db.get(`
      SELECT * FROM user_devices 
      WHERE user_id = ? AND scenario_code = ? AND device_name = ?
    `, userId, scenarioCode, deviceName);

    res.json({
      device: {
        name: device.device_name,
        type: device.device_type,
        size: device.size,
        partitionName: device.partition_name,
        mounted: device.mounted === 1,
        mountPoint: device.mount_point,
        content: JSON.parse(device.device_data)
      }
    });
  } catch (error) {
    console.error('Device attach error:', error);
    res.status(500).json({ error: 'Failed to attach device' });
  }
});

/**
 * List attached devices for current user/scenario
 * GET /api/devices?scenarioCode=xxx
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const { scenarioCode } = req.query;
    const userId = req.user.id || req.user.userId;

    if (!scenarioCode) {
      return res.status(400).json({ error: 'scenarioCode is required' });
    }

    const db = getDb();
    const devices = await db.all(`
      SELECT * FROM user_devices 
      WHERE user_id = ? AND scenario_code = ?
      ORDER BY created_at ASC
    `, userId, scenarioCode);

    res.json({
      devices: devices.map(device => ({
        name: device.device_name,
        type: device.device_type,
        size: device.size,
        partitionName: device.partition_name,
        mounted: device.mounted === 1,
        mountPoint: device.mount_point,
        content: JSON.parse(device.device_data)
      }))
    });
  } catch (error) {
    console.error('Get devices error:', error);
    res.status(500).json({ error: 'Failed to get devices' });
  }
});

/**
 * Mount a device
 * POST /api/devices/mount
 * Body: { scenarioCode, device, mountPoint }
 * 
 * Supports:
 * - Regular device paths: /dev/sdb1, /dev/sdc1
 * - Forensic image paths: /forensic/evidence.img, /forensic/memdump.img
 */
router.post('/mount', authenticate, async (req, res) => {
  try {
    const { scenarioCode, device, mountPoint } = req.body;
    const userId = req.user.id || req.user.userId;

    if (!scenarioCode || !device || !mountPoint) {
      return res.status(400).json({ error: 'scenarioCode, device, and mountPoint are required' });
    }

    const db = getDb();
    
    let deviceRecord;
    let deviceName;
    
    // Check if this is a forensic image path (e.g., /forensic/evidence.img)
    if (device.startsWith('/forensic/') && device.endsWith('.img')) {
      // For forensic images, find the most recently attached device for this scenario
      // This simulates mounting a forensic copy that was created with dd
      deviceRecord = await db.get(`
        SELECT * FROM user_devices 
        WHERE user_id = ? AND scenario_code = ?
        ORDER BY created_at DESC
        LIMIT 1
      `, userId, scenarioCode);
      
      if (deviceRecord) {
        deviceName = deviceRecord.device_name;
      }
    } else {
      // Extract device name from device path (e.g., /dev/sdc1 -> sdc)
      deviceName = device.replace('/dev/', '').replace(/1$/, '');
      
      // Find the device
      deviceRecord = await db.get(`
        SELECT * FROM user_devices 
        WHERE user_id = ? AND scenario_code = ? AND device_name = ?
      `, userId, scenarioCode, deviceName);
    }

    if (!deviceRecord) {
      return res.status(404).json({ error: 'Device not found. You must attach the device first.' });
    }

    // Check if already mounted
    if (deviceRecord.mounted === 1) {
      if (deviceRecord.mount_point === mountPoint) {
        return res.json({ message: `Device already mounted on ${mountPoint}` });
      }
      return res.status(400).json({ error: `Device already mounted on ${deviceRecord.mount_point}` });
    }

    // Get device content
    const deviceContent = JSON.parse(deviceRecord.device_data);

    // Mount content to VFS
    await mountDeviceContentToVFS(userId, scenarioCode, mountPoint, deviceContent);

    // Update device mount status
    await db.run(`
      UPDATE user_devices 
      SET mounted = 1, mount_point = ?
      WHERE user_id = ? AND scenario_code = ? AND device_name = ?
    `, mountPoint, userId, scenarioCode, deviceName);

    res.json({
      message: `Mounted ${device} on ${mountPoint}`,
      device: {
        name: deviceRecord.device_name,
        type: deviceRecord.device_type,
        size: deviceRecord.size,
        partitionName: deviceRecord.partition_name,
        mounted: true,
        mountPoint: mountPoint
      }
    });
  } catch (error) {
    console.error('Device mount error:', error);
    res.status(500).json({ error: 'Failed to mount device' });
  }
});

/**
 * Unmount a device
 * POST /api/devices/unmount
 * Body: { scenarioCode, mountPoint }
 */
router.post('/unmount', authenticate, async (req, res) => {
  try {
    const { scenarioCode, mountPoint } = req.body;
    const userId = req.user.id || req.user.userId;

    if (!scenarioCode || !mountPoint) {
      return res.status(400).json({ error: 'scenarioCode and mountPoint are required' });
    }

    const db = getDb();
    
    // Find device by mount point
    const deviceRecord = await db.get(`
      SELECT * FROM user_devices 
      WHERE user_id = ? AND scenario_code = ? AND mount_point = ?
    `, userId, scenarioCode, mountPoint);

    if (!deviceRecord) {
      return res.status(404).json({ error: 'No device mounted at that mount point' });
    }

    // Update device mount status
    await db.run(`
      UPDATE user_devices 
      SET mounted = 0, mount_point = NULL
      WHERE user_id = ? AND scenario_code = ? AND mount_point = ?
    `, userId, scenarioCode, mountPoint);

    res.json({
      message: `Unmounted ${mountPoint}`,
      device: {
        name: deviceRecord.device_name,
        type: deviceRecord.device_type
      }
    });
  } catch (error) {
    console.error('Device unmount error:', error);
    res.status(500).json({ error: 'Failed to unmount device' });
  }
});

export { router as deviceRoutes };


/**
 * WhatsApp Notifier Service
 * Sends critical logs to administrator via WhatsApp API
 */

const fetch = require('node-fetch');

const ADMIN_PHONE = '573008021701';
const WHAPI_URL = 'https://gate.whapi.cloud/messages/text';
const WHAPI_TOKEN = 'due3eWCwuBM2Xqd6cPujuTRqSbMb68lt';

class WhatsAppNotifier {
    constructor() {
        this.messageQueue = [];
        this.isSending = false;
        this.lastSentTime = 0;
        this.minInterval = 10000; // Minimum 10 seconds between messages
    }

    /**
     * Send text message via WhatsApp API
     */
    async sendTextMessage(toNumber, messageBody) {
        const headers = {
            'accept': 'application/json',
            'authorization': `Bearer ${WHAPI_TOKEN}`,
            'content-type': 'application/json'
        };

        const postData = {
            'typing_time': 0,
            'to': toNumber,
            'body': messageBody
        };

        try {
            const response = await fetch(WHAPI_URL, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(postData)
            });

            const json = await response.json();
            console.log('✅ WhatsApp message sent:', json);
            return json;
        } catch (err) {
            console.error('❌ WhatsApp send error:', err);
            throw err;
        }
    }

    /**
     * Queue critical event for WhatsApp notification
     */
    queueNotification(event) {
        // Send errors, criticals, and important Twilio events
        const shouldSend = event.level === 'error' ||
                          event.level === 'critical' ||
                          (event.category === 'twilio' && event.level === 'info') ||  // Twilio connection steps
                          (event.category === 'camera' && event.level === 'error') || // Camera errors
                          (event.category === 'network' && event.level === 'error');  // Network errors

        if (shouldSend) {
            this.messageQueue.push(event);
            this.processQueue();
        }
    }

    /**
     * Process message queue with rate limiting
     */
    async processQueue() {
        if (this.isSending || this.messageQueue.length === 0) {
            return;
        }

        const now = Date.now();
        if (now - this.lastSentTime < this.minInterval) {
            // Wait before sending next message
            setTimeout(() => this.processQueue(), this.minInterval);
            return;
        }

        this.isSending = true;

        try {
            // Get up to 5 messages to batch
            const batch = this.messageQueue.splice(0, 5);
            const message = this.formatBatchMessage(batch);

            await this.sendTextMessage(ADMIN_PHONE, message);
            this.lastSentTime = Date.now();
        } catch (error) {
            console.error('Failed to send WhatsApp batch:', error);
        } finally {
            this.isSending = false;

            // Process remaining messages
            if (this.messageQueue.length > 0) {
                setTimeout(() => this.processQueue(), this.minInterval);
            }
        }
    }

    /**
     * Format multiple events into single message
     */
    formatBatchMessage(events) {
        const timestamp = new Date().toLocaleString('es-CO', {
            timeZone: 'America/Bogota',
            hour12: false
        });

        let message = `🚨 *LOGS TELEMEDICINA*\n`;
        message += `📅 ${timestamp}\n\n`;

        events.forEach((event, index) => {
            const icon = event.level === 'error' ? '❌' : '⚠️';

            // 🧟 Marcar logs zombie
            let zombieTag = '';
            if (event.isZombie) {
                zombieTag = ` 🧟 [ZOMBIE ${event.zombieDelayMinutes}m ago]`;
            } else if (event.isDelayed) {
                zombieTag = ` ⏱️ [delayed ${Math.floor(event.delayMs / 1000)}s]`;
            }

            message += `${icon} *${event.userType}* (${event.sessionCode})${zombieTag}\n`;
            message += `   ${event.message}\n`;
            if (event.details) {
                message += `   Detalles: ${event.details}\n`;
            }
            if (index < events.length - 1) {
                message += `\n`;
            }
        });

        return message;
    }

    /**
     * Send immediate critical alert (bypasses queue)
     */
    async sendCriticalAlert(sessionCode, userType, message, details = null) {
        const timestamp = new Date().toLocaleString('es-CO', {
            timeZone: 'America/Bogota',
            hour12: false
        });

        let alert = `🔴 *ALERTA CRÍTICA*\n`;
        alert += `📅 ${timestamp}\n`;
        alert += `👤 ${userType}: ${sessionCode}\n\n`;
        alert += `${message}`;

        if (details) {
            alert += `\n\n📋 Detalles:\n${details}`;
        }

        try {
            await this.sendTextMessage(ADMIN_PHONE, alert);
        } catch (error) {
            console.error('Failed to send critical alert:', error);
        }
    }

    /**
     * Send session summary
     */
    async sendSessionSummary(sessionCode, logs) {
        const timestamp = new Date().toLocaleString('es-CO', {
            timeZone: 'America/Bogota',
            hour12: false
        });

        const errors = logs.filter(l => l.level === 'error');
        const warnings = logs.filter(l => l.level === 'warning');

        if (errors.length === 0 && warnings.length === 0) {
            return; // Don't send if session was successful
        }

        let message = `📊 *RESUMEN SESIÓN*\n`;
        message += `📅 ${timestamp}\n`;
        message += `🔑 Código: ${sessionCode}\n\n`;
        message += `❌ Errores: ${errors.length}\n`;
        message += `⚠️ Advertencias: ${warnings.length}\n\n`;

        if (errors.length > 0) {
            message += `*Errores principales:*\n`;
            errors.slice(0, 3).forEach(err => {
                message += `• ${err.message}\n`;
            });
        }

        try {
            await this.sendTextMessage(ADMIN_PHONE, message);
        } catch (error) {
            console.error('Failed to send session summary:', error);
        }
    }

    /**
     * 📞 Notify new session created by doctor
     */
    async notifyNewSession(doctorName, sessionCode) {
        const timestamp = new Date().toLocaleString('es-CO', {
            timeZone: 'America/Bogota',
            hour12: false
        });

        let message = `📞 *NUEVA SESIÓN*\n`;
        message += `📅 ${timestamp}\n\n`;
        message += `👨‍⚕️ Doctor: *${doctorName}*\n`;
        message += `🔑 Código: *${sessionCode}*\n\n`;
        message += `⏳ Esperando paciente...`;

        try {
            await this.sendTextMessage(ADMIN_PHONE, message);
        } catch (error) {
            console.error('Failed to send new session notification:', error);
        }
    }

    /**
     * 👤 Notify patient connected to session
     */
    async notifyPatientConnected(doctorName, patientName, sessionCode) {
        const timestamp = new Date().toLocaleString('es-CO', {
            timeZone: 'America/Bogota',
            hour12: false
        });

        let message = `👤 *PACIENTE CONECTADO*\n`;
        message += `📅 ${timestamp}\n\n`;
        message += `👨‍⚕️ Doctor: ${doctorName}\n`;
        message += `👤 Paciente: *${patientName}*\n`;
        message += `🔑 Sesión: ${sessionCode}\n\n`;
        message += `✅ Consulta iniciada`;

        try {
            await this.sendTextMessage(ADMIN_PHONE, message);
        } catch (error) {
            console.error('Failed to send patient connected notification:', error);
        }
    }

    /**
     * 🔌 Notify patient disconnected
     */
    async notifyPatientDisconnected(doctorName, patientName, sessionCode) {
        const timestamp = new Date().toLocaleString('es-CO', {
            timeZone: 'America/Bogota',
            hour12: false
        });

        let message = `🔌 *PACIENTE DESCONECTADO*\n`;
        message += `📅 ${timestamp}\n\n`;
        message += `👨‍⚕️ Doctor: ${doctorName}\n`;
        message += `👤 Paciente: ${patientName}\n`;
        message += `🔑 Sesión: ${sessionCode}`;

        try {
            await this.sendTextMessage(ADMIN_PHONE, message);
        } catch (error) {
            console.error('Failed to send patient disconnected notification:', error);
        }
    }

    /**
     * ✅ Notify session completed successfully
     */
    async notifySessionCompleted(doctorName, patientName, sessionCode, durationMs) {
        const timestamp = new Date().toLocaleString('es-CO', {
            timeZone: 'America/Bogota',
            hour12: false
        });

        const minutes = Math.floor(durationMs / 60000);
        const seconds = Math.floor((durationMs % 60000) / 1000);

        let message = `✅ *SESIÓN COMPLETADA*\n`;
        message += `📅 ${timestamp}\n\n`;
        message += `👨‍⚕️ Doctor: ${doctorName}\n`;
        message += `👤 Paciente: ${patientName}\n`;
        message += `🔑 Sesión: ${sessionCode}\n`;
        message += `⏱️ Duración: ${minutes}m ${seconds}s`;

        try {
            await this.sendTextMessage(ADMIN_PHONE, message);
        } catch (error) {
            console.error('Failed to send session completed notification:', error);
        }
    }
}

// Export singleton instance
const notifier = new WhatsAppNotifier();
module.exports = notifier;

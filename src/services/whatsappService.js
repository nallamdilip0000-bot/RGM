/**
 * WhatsApp Messaging Service (Disabled per system configuration)
 */
const sendWhatsAppMessage = async () => {
  return { success: false, disabled: true, reason: 'WHATSAPP_DISABLED' };
};

module.exports = {
  sendWhatsAppMessage
};

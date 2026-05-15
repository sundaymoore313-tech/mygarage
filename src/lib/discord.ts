/**
 * Discord feedback integration via webhook.
 * Sends user feedback from the website directly to a Discord channel.
 */

const discordWebhookUrl = import.meta.env.VITE_DISCORD_FEEDBACK_WEBHOOK as string | undefined

export const isDiscordConfigured = Boolean(discordWebhookUrl)

type DiscordEmbedColor = number

export async function sendDiscordFeedback(
  message: string,
  userEmail?: string,
  color: DiscordEmbedColor = 0x3498db, // blue
): Promise<{ success: boolean; error?: string }> {
  if (!discordWebhookUrl) {
    return { success: false, error: 'Discord webhook not configured' }
  }

  if (!message || message.trim().length === 0) {
    return { success: false, error: 'Feedback message cannot be empty' }
  }

  try {
    const timestamp = new Date().toISOString()
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'

    const embed = {
      title: '💬 New Feedback from Website',
      description: message.substring(0, 2000), // Discord embed limit
      color,
      fields: [
        ...(userEmail ? [{ name: 'User Email', value: userEmail, inline: true }] : []),
        { name: 'Timestamp', value: timestamp, inline: true },
        { name: 'User Agent', value: userAgent.substring(0, 1024), inline: false },
      ],
      footer: {
        text: 'mygarage feedback',
      },
    }

    const response = await fetch(discordWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        embeds: [embed],
      }),
    })

    if (!response.ok) {
      return { success: false, error: `Discord API error: ${response.statusText}` }
    }

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error sending feedback',
    }
  }
}

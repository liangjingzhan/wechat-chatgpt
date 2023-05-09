import * as dotenv from 'dotenv'
dotenv.config()

const env = process.env

export const config = {
    openaiApiUrl: env.OPENAI_API_URL,
    openaiApiKey: env.OPENAI_API_KEY,
    openaiModel: env.OPENAI_MODEL || 'gpt-3.5-turbo',
    openaiTemperature: env.OPENAI_TEMPERATURE ? parseFloat(env.OPENAI_TEMPERATURE) : 0.6,
}
import { Configuration, ChatCompletionRequestMessageRoleEnum, CreateImageRequestResponseFormatEnum, CreateImageRequestSizeEnum, OpenAIApi } from 'openai'
import fs from 'fs'
import chatCache from './cache'
import { config } from './config'

const configuration = new Configuration({
    apiKey: config.openaiApiKey,
    basePath: config.openaiApiUrl,
})
const openai = new OpenAIApi(configuration)

/**
 * Get completion from OpenAI
 * @param username
 * @param message
 */
async function chatgpt(username: string, message: string): Promise<string> {
    const messages = chatCache.getChatMessages(username)
    messages.push({
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: message,
    })
    let response: any
    try {
        response = await openai.createChatCompletion({
            model: config.openaiModel,
            messages: messages,
            temperature: config.openaiTemperature,
        })
    } catch (e: any) {
        if (e?.response?.statusText) {
            console.error('openai error:' + e.response.statusText)
            if (e.response.statusText === 'Too Many Requests') {
                // TODO
            }
            return e.response.statusText
        }
        console.error(e)
        return 'Openai api error'
    }
    let assistantMessage = ''
    try {
        if (response.status === 200) {
            assistantMessage = response.data.choices[0].message?.content.replace(/^\n+|\n+$/g, '') as string
            // 请求成功后加入对话上下文
            chatCache.addUserMessage(username, message)
            chatCache.addAssistantMessage(username, assistantMessage)
        } else {
            const err = `Something went wrong, status: ${response.status}, ${response.statusText}`
            console.error(err)
        }
    } catch (e: any) {
        if (e.request) {
            assistantMessage = '请求出错'
            console.error(assistantMessage)
        }
    }
    return assistantMessage
}

/**
 * Get image from Dall·E
 * @param username
 * @param prompt
 */
async function dalle(username: string, prompt: string): Promise<string> {
    const response = await openai
        .createImage({
            prompt: prompt,
            n: 1,
            size: CreateImageRequestSizeEnum._512x512,
            response_format: CreateImageRequestResponseFormatEnum.Url,
            user: username,
        })
        .then(res => res.data)
        .catch(err => console.log(err))
    if (response) {
        return response.data[0].url as string
    } else {
        return 'Generate image failed'
    }
}

/**
 * Speech to text
 * @param username
 * @param videoPath
 */
async function whisper(username: string, videoPath: string): Promise<string> {
    const file: any = fs.createReadStream(videoPath)
    const response = await openai
        .createTranscription(file, 'whisper-1')
        .then(res => res.data)
        .catch(err => console.log(err))
    if (response) {
        return response.text
    } else {
        return 'Speech to text failed'
    }
}

export { chatgpt, dalle, whisper }

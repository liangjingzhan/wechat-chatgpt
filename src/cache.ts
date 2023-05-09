import { ChatCompletionRequestMessage, ChatCompletionRequestMessageRoleEnum } from 'openai'
import { isTokenOverLimit } from './utils'

export interface User {
    username: string
    chatMessages: Array<ChatCompletionRequestMessage>
}

// 使用内存记录用户的对话
class Cache {
    private data: User[] = []

    /**
     * 添加一个用户, 如果用户已存在则返回已存在的用户
     * @param username
     */
    public addUser(username: string): User {
        const existUser = this.data.find(user => user.username === username)
        if (existUser) {
            console.log(`User ${username} already exists`)
            return existUser
        }
        const newUser: User = {
            username: username,
            chatMessages: [
                {
                    role: ChatCompletionRequestMessageRoleEnum.System,
                    content: 'You are a helpful assistant.',
                },
            ],
        }
        this.data.push(newUser)
        return newUser
    }

    /**
     * 根据用户名获取用户, 如果用户不存在则添加用户
     * @param username
     */
    public getUser(username: string): User {
        return this.data.find(user => user.username === username) || this.addUser(username)
    }

    /**
     * 获取用户的聊天记录
     * @param username
     */
    public getChatMessages(username: string): Array<ChatCompletionRequestMessage> {
        return this.getUser(username).chatMessages
    }

    /**
     * 设置用户的prompt
     * @param username
     * @param prompt
     */
    public setPrompt(username: string, prompt: string): void {
        const user = this.getUser(username)
        if (user) {
            user.chatMessages[0].content = prompt
        }
    }

    public addMessage(username: string, message: string, role: ChatCompletionRequestMessageRoleEnum): Array<ChatCompletionRequestMessage> {
        const user = this.getUser(username)
        if (user) {
            while (isTokenOverLimit(user.chatMessages)) {
                // 删除从第2条开始的消息(因为第一条是prompt)
                user.chatMessages.splice(1, 1)
            }
            user.chatMessages.push({
                role,
                content: message,
            })
        }
        return user.chatMessages
    }

    /**
     * 添加用户输入的消息
     * @param username
     * @param message
     */
    public addUserMessage(username: string, message: string): Array<ChatCompletionRequestMessage> {
        return this.addMessage(username, message, ChatCompletionRequestMessageRoleEnum.User)
    }

    /**
     * 添加ChatGPT的回复
     * @param username
     * @param message
     */
    public addAssistantMessage(username: string, message: string): Array<ChatCompletionRequestMessage> {
        return this.addMessage(username, message, ChatCompletionRequestMessageRoleEnum.Assistant)
    }

    /**
     * 清空用户的聊天记录, 并将prompt设置为默认值
     * @param username
     */
    public clearHistory(username: string): void {
        const user = this.getUser(username)
        if (user) {
            user.chatMessages = [
                {
                    role: ChatCompletionRequestMessageRoleEnum.System,
                    content: 'You are a helpful assistant.',
                },
            ]
        }
    }

    public getAllData(): User[] {
        return this.data
    }
}
const chatCache = new Cache()
export default chatCache

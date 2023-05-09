import { ContactImpl, ContactInterface, RoomImpl, RoomInterface } from 'wechaty/impls'
import { Message } from 'wechaty'
import { FileBox } from 'file-box'
import { chatgpt, dalle, whisper } from './openai.js'
import cache from './cache.js'
import { regexpEncode } from "./utils.js";

enum MessageType {
    Unknown = 0,
    Attachment = 1, // Attach(6),
    Audio = 2, // Audio(1), Voice(34)
    Contact = 3, // ShareCard(42)
    ChatHistory = 4, // ChatHistory(19)
    Emoticon = 5, // Sticker: Emoticon(15), Emoticon(47)
    Image = 6, // Img(2), Image(3)
    Text = 7, // Text(1)
    Location = 8, // Location(48)
    MiniProgram = 9, // MiniProgram(33)
    GroupNote = 10, // GroupNote(53)
    Transfer = 11, // Transfers(2000)
    RedEnvelope = 12, // RedEnvelopes(2001)
    Recalled = 13, // Recalled(10002)
    Url = 14, // Url(5)
    Video = 15, // Video(4), Video(43)
    Post = 16, // Moment, Channel, Tweet, etc
}
const SINGLE_MESSAGE_MAX_SIZE = 1000
type Speaker = RoomImpl | ContactImpl
interface ICommand {
    name: string
    description: string
    exec: (talker: Speaker, text?: string) => Promise<void>
}

export class ChatGPTBot {
    botName: string = ''
    setBotName(botName: string) {
        this.botName = botName
    }
    get chatGroupTriggerRegEx(): RegExp {
        return new RegExp(`^@${regexpEncode(this.botName)}\\s`);
    }
    matchCommand(rawText: string): [string | undefined, string | undefined] {
        const privateReg = /^\/cmd\s([a-z]+)\s?(.*)/
        const groupReg = new RegExp(`^@${regexpEncode(this.botName)}\\s\/cmd\\s([a-z]+)\\s?(.*)`)
        let match = rawText.match(privateReg) || rawText.match(groupReg)
        if (match?.index === 0) {
            return [match[1], match[2]]
        }
        return [undefined, undefined]
    }
    private readonly commands: ICommand[] = [
        {
            name: 'help',
            description: '显示帮助信息',
            exec: async talker => {
                await talker.say(
                    '========\n' +
                        '/cmd help\n' +
                        '# 显示帮助信息\n' +
                        '/cmd prompt <PROMPT>\n' +
                        '# 设置当前会话的 prompt \n' +
                        '/cmd image <PROMPT>\n' +
                        '# 根据 prompt 生成图片\n' +
                        '/cmd clear\n' +
                        '# 清除自上次启动以来的所有会话\n' +
                        '========'
                )
            },
        },
        {
            name: 'prompt',
            description: '设置当前会话的 prompt',
            exec: async (talker, prompt) => {
                if (!prompt) {
                    await talker.say('请输入 prompt 信息')
                    return
                }
                if (talker instanceof RoomImpl) {
                    cache.setPrompt(await talker.topic(), prompt)
                } else {
                    cache.setPrompt(talker.name(), prompt)
                }
                await talker.say('prompt 已设置')
            },
        },
        {
            name: 'clear',
            description: '清除自上次启动以来的所有会话',
            exec: async talker => {
                if (talker instanceof RoomImpl) {
                    cache.clearHistory(await talker.topic())
                } else {
                    cache.clearHistory(talker.name())
                }
                await talker.say('会话已清除')
            },
        },
        {
            name: 'image',
            description: '根据 prompt 生成图片',
            exec: async (talker, prompt) => {
                if (!prompt) {
                    await talker.say('请输入 prompt 信息')
                    return
                }
                let url = (await dalle(this.botName, prompt)) as string
                const fileBox = FileBox.fromUrl(url)
                talker.say(fileBox)
            }
        }
    ]

    async command(contact: any, commandStr: string, prompt?: string): Promise<void> {
        const cmd = this.commands.find(c => c.name === commandStr)
        if (cmd) {
            await cmd.exec(contact, prompt)
        }
    }
    
    async getGPTMessage(talkerName: string, text: string): Promise<string> {
        let gptMessage = await chatgpt(talkerName, text)
        if (gptMessage !== '') {
            return gptMessage
        }
        return 'Sorry, please try again later. 😔'
    }
    
    // The message is segmented according to its size
    async trySay(talker: RoomInterface | ContactInterface, mesasge: string): Promise<void> {
        const messages: Array<string> = []
        let message = mesasge
        while (message.length > SINGLE_MESSAGE_MAX_SIZE) {
            messages.push(message.slice(0, SINGLE_MESSAGE_MAX_SIZE))
            message = message.slice(SINGLE_MESSAGE_MAX_SIZE)
        }
        messages.push(message)
        for (const msg of messages) {
            await talker.say(msg)
        }
    }

    // Check whether the ChatGPT processing can be triggered
    triggerGPTMessage(text: string, privateChat: boolean = false): boolean {
        if (privateChat) {
            return true
        } else {
            // Reply message which @bot
            return this.chatGroupTriggerRegEx.test(text);
        }
    }
    
    // Filter out the message that does not need to be processed
    isNonsense(talker: ContactInterface, messageType: MessageType, text: string): boolean {
        return (
            talker.self() ||
            // TODO: add doc support
            !(messageType == MessageType.Text || messageType == MessageType.Audio) ||
            talker.name() === '微信团队' ||
            // 语音(视频)消息
            text.includes('收到一条视频/语音聊天消息，请在手机上查看') ||
            // 红包消息
            text.includes('收到红包，请在手机上查看') ||
            // Transfer message
            text.includes('收到转账，请在手机上查看') ||
            // 位置消息
            text.includes('/cgi-bin/mmwebwx-bin/webwxgetpubliclinkimg')
        )
    }

    async onPrivateMessage(talker: ContactInterface, text: string) {
        const gptMessage = await this.getGPTMessage(talker.name(), text)
        await this.trySay(talker, gptMessage)
    }

    async onGroupMessage(talker: ContactInterface, text: string, room: RoomInterface) {
        const gptMessage = await this.getGPTMessage(await room.topic(), text)
        const result = `@${talker.name()} ${text}\n------\n ${gptMessage}`
        await this.trySay(room, result)
    }

    async onMessage(message: Message) {
        const talker = message.talker()
        const rawText = message.text()
        const room = message.room()
        const messageType = message.type()
        const privateChat = !room
        if (privateChat) {
            console.log(`🤵 Contact: ${talker.name()} 💬 Text: ${rawText}`)
        } else {
            const topic = await room.topic()
            console.log(`🚪 Room: ${topic} 🤵 Contact: ${talker.name()} 💬 Text: ${rawText}`)
        }
        if (this.isNonsense(talker, messageType, rawText)) {
            return
        }
        if (messageType == MessageType.Audio) {
            // 保存语音文件
            const fileBox = await message.toFileBox()
            let fileName = './public/' + fileBox.name
            await fileBox.toFile(fileName, true).catch(e => {
                console.log('保存语音失败', e)
                return
            })
            // Whisper
            whisper('', fileName).then(text => {
                talker.say(text)
            })
            return
        }
        const [command, prompt] = this.matchCommand(rawText)
        if (command) {
            console.log(`🤖 Command: ${command} ${prompt}`)
            await this.command(privateChat ? talker : room, command, prompt)
            return
        }
        if (this.triggerGPTMessage(rawText, privateChat)) {
            if (privateChat) {
                return await this.onPrivateMessage(talker, rawText)
            } else {
                return await this.onGroupMessage(talker, rawText, room)
            }
        }
    }
}

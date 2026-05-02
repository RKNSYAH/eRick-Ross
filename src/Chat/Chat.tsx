import { useEffect, useState } from 'react';
import ChatField from '../Components/ChatField.tsx'
import { GoogleGenAI } from '@google/genai';
import ReactMarkdown from 'react-markdown';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const SYSTEM_INSTRUCTION = import.meta.env.VITE_GEMINI_INSTRUCTION
type Message = {
  role: 'user' | 'ai';
  text: string;
  isLoading?: boolean;
};

function App() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("")

  const chat = genAI.chats.create({
    model: 'gemini-3.1-flash-lite-preview',
    config: {
      temperature: 0.2,
      maxOutputTokens: 1024,
      systemInstruction: SYSTEM_INSTRUCTION
    },
  })

  async function sendChatMessage() {
    if (!inputMessage.trim()) return; // Prevent sending empty messages

    setMessages(prev => [
      ...prev,
      { role: 'user', text: inputMessage },
      { role: 'ai', text: '', isLoading: true }
    ]);

    try {
      const response = await chat.sendMessage({
        message: inputMessage,
      });
      setInputMessage("");
      setMessages(prev => {
        const updated = [...prev];
        const lastIndex = updated.length - 1;

        if (response.text) {
          updated[lastIndex] = {
            role: 'ai',
            text: response.text,
            isLoading: false
          };
        }

        return updated;
      });
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setInputMessage("");
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExpanded(true);
    }, 50);


    return () => { clearTimeout(timer) };
  }, []);

  return (
    <div className='flex flex-col items-center pb-20 justify-center min-h-screen bg-primary px-3 py-3 overflow-x-hidden'>

      <div id="app" className={"mb-4 w-0 max-h-130 overflow-hidden transition-all duration-700 max-w-3xl shadow-md shadow-secondary/40 rounded-4xl bg-white flex flex-col" + (isExpanded ? " h-150 w-full" : "w-0 h-0")}>
        <div className="overflow-y-auto mr-1.5 my-0.5 h-full [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-3xl [&::-webkit-scrollbar-thumb]:bg-gray-300">

          <section id="header" className="flex flex-col w-full items-start justify-between p-4 md:p-6 text-center">
            {messages.length > 0 && messages.map((message, index) => (
              <div key={index} className="flex flex-col w-full">
                {message.role === 'user' && (
                  <div className="flex flex-row-reverse self-end gap-3">
                    <img src="/sulogo.png" className='w-7 h-7 md:w-9 md:h-9 rounded-full border-3 border-primary' alt="eRick Ross Logo" />
                    <div className="relative mt-5">
                      <div className="relative color-primary bg-primary text-white px-4 py-2 rounded-2xl rounded-tr-none shadow-md">
                        <p className="text-sm text-left font-normal max-w-72">{message.role === 'user' ? message.text : message.text}</p>
                      </div>
                    </div>
                  </div>
                )
                }

                {message.role === 'ai' && (


                  <div className="flex flex-row self-start gap-3">
                    <>
                      <img src="/sulogo.png" className='w-7 h-7 md:w-9 md:h-9 rounded-full border-3 border-primary' alt="eRick Ross Logo" />
                      <div className="relative mt-5">
                        <div className="relative color-primary bg-primary text-white px-4 py-2 rounded-2xl rounded-tl-none shadow-md">
                          {message.isLoading ? (
                            <div className="flex-1 animate-pulse space-y-2 py-1 max-w-72 w-72">
                              <div className="h-2 w-1/2 rounded bg-gray-200"></div>
                              <div className="h-2 w-5/6 rounded bg-gray-200"></div>
                              <div className="h-2 w-3/4 rounded bg-gray-200"></div>
                            </div>
                          ) : (
                            <div className="text-sm text-left font-normal max-w-72">

                              <ReactMarkdown key={index} >
                                {message.role === 'ai' ? message.text : message.text}
                              </ReactMarkdown>
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  </div>
                )
                }

              </div>
            ))}
          </section>
        </div>

      </div>
      <div className="fixed bottom-2 left-0 w-full px-3 pb-3 bg-primary">
        <div className="max-w-3xl mx-auto shadow-md shadow-secondary/40 rounded-3xl bg-white p-2">
          <ChatField prop={setInputMessage} inputMessage={inputMessage} onSend={sendChatMessage} />
        </div>
      </div>
    </div >
  )
}

export default App
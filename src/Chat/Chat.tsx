import { useEffect, useRef, useState } from 'react';
import ChatField from '../Components/ChatField.tsx'
import ReactMarkdown from 'react-markdown';
import { useChat } from '../hooks/useChat.tsx';
import remarkGfm from "remark-gfm";
import { useLocation, useLoaderData } from "react-router"

export async function loader() {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!GEMINI_API_KEY || !SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Missing required environment variables");
  }

  return {
    GEMINI_API_KEY,
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
  };
}

function App() {
  const [isExpanded, setIsExpanded] = useState(false);
  const loaderData = useLoaderData<typeof loader>();
  const { messages, sendMessage } = useChat(loaderData);
  const location = useLocation();
  const hasProcessedInitial = useRef(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };



  useEffect(() => {
    const initialMessage = (location.state as { initialMessage?: string })?.initialMessage;

    if (initialMessage && !hasProcessedInitial.current) {
      hasProcessedInitial.current = true;
      sendMessage(initialMessage);

      // Clear the state so refreshing doesn't re-send
      window.history.replaceState({}, '');
    }
  }, [location.state, sendMessage]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);


  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExpanded(true);
    }, 50);


    return () => { clearTimeout(timer) };
  }, []);

  return (
    <div className='flex flex-col items-center pb-20 justify-center min-h-screen bg-primary px-3 py-3 overflow-x-hidden'>

      <div id="app" className={"mb-4 w-0 max-h-140 overflow-hidden transition-all duration-700 max-w-3xl shadow-md shadow-secondary/40 rounded-4xl bg-white flex flex-col" + (isExpanded ? " h-150 w-full" : "w-0 h-0")}>
        <div className="overflow-y-auto mr-1.5 my-0.5 h-full [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-3xl [&::-webkit-scrollbar-thumb]:bg-gray-300">

          <section id="header" className="flex flex-col w-full items-start justify-between p-4 md:p-6 text-center">
            {messages.length > 0 && messages.map((message, index) => (
              <div key={index} className="flex flex-col w-full">
                {message.role === 'user' && (
                  <div className="flex flex-row-reverse self-end gap-3">
                    <img src="/sulogo.png" className='w-7 h-7 md:w-9 md:h-9 rounded-full border-3 border-primary' alt="eRick Ross Logo" />
                    <div className="relative mt-5">
                      <div className="relative color-primary bg-primary text-white px-4 py-2 rounded-2xl rounded-tr-none shadow-md">
                        <p className="text-sm text-left font-normal max-w-md">{message.role === 'user' ? message.text : message.text}</p>
                      </div>
                    </div>
                  </div>
                )
                }

                {message.role === 'ai' && (


                  <div className="flex flex-row self-start gap-3">
                    <>
                      <div className="w-7 h-7 md:w-9 md:h-9 rounded-full overflow-hidden border-3 border-primary shrink-0">
                        <img
                          src="/erik.jpg"
                          className="w-full h-full object-cover scale-[2.8] origin-[50%_10%]"
                          alt="eRick Ross Logo"
                        />
                      </div>
                      <div className="relative mt-5">
                        <div className="relative color-primary bg-primary text-white px-4 py-2 rounded-2xl rounded-tl-none shadow-md">
                          {message.isLoading ? (
                            <div className="flex-1 animate-pulse space-y-2 py-1 max-w-72 w-72">
                              <div className="h-2 w-1/2 rounded bg-gray-200"></div>
                              <div className="h-2 w-5/6 rounded bg-gray-200"></div>
                              <div className="h-2 w-3/4 rounded bg-gray-200"></div>
                            </div>
                          ) : (
                            <div className="prose prose-sm prose-invert prose-p:text-white prose-headings:text-white prose-strong:text-white prose-li:text-white prose-a:text-white prose-hr:border-white/30 max-w-md text-left prose-p:my-2 prose-ul:my-2 prose-li:my-1 prose-hr:my-3">

                              <ReactMarkdown skipHtml={false} remarkPlugins={[remarkGfm]} key={index} >
                                {message.text}
                              </ReactMarkdown>
                            </div>
                          )}
                          <div ref={messagesEndRef} />
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
          <ChatField onSend={sendMessage} />
        </div>
      </div>
    </div >
  )
}

export default App
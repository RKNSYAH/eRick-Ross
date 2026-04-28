import { useEffect, useState } from 'react';
import ChatField from '../Components/ChatField.tsx'

function App() {
    const [isExpanded, setIsExpanded] = useState(false);
    useEffect(() => {
    const timer = setTimeout(() => {
        setIsExpanded(true);
    }, 50); 
    
    return () => clearTimeout(timer);
    }, []);

  return (
    <div className='flex flex-col items-center pb-20 justify-center min-h-screen bg-primary px-3 py-3 overflow-x-hidden'>
      
      <div id="app" className={"mb-4 w-0 max-h-120 transition-all duration-700 max-w-3xl shadow-md shadow-secondary/40 rounded-3xl bg-white overflow-hidden flex flex-col" + (isExpanded ? " h-150 w-full" : "w-0 h-0")}>
        
        <section id="header" className="flex flex-col w-full items-center justify-between p-4 md:p-6 text-center">
        </section>
      </div>
      <div className="fixed bottom-2 left-0 w-full px-3 pb-3 bg-primary">
        <div className="max-w-3xl mx-auto shadow-md shadow-secondary/40 rounded-3xl bg-white p-2">
          <ChatField />
        </div>
      </div>
    </div>
  )
}

export default App
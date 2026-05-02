import './App.css'
import ChatField from './Components/ChatField'
import FaqButton from './Components/FaqButton'

function App() {
  const faqs = [
    "Item Booking", "Academic advising", "UKM List", "Booking Room",
    "Course Prerequisites", "Calendar", "Contacts", "Subject Taking Plan",
    "Handbook Policy", "Tutoring", "Class Schedule", "Tuition fee payment"
  ]

  return (
    <div className='flex flex-col items-center pb-20 justify-center min-h-screen bg-primary px-3 py-3 overflow-x-hidden'>
      
      <div id="app" className="mb-4 w-full max-w-3xl shadow-md shadow-secondary/40 rounded-3xl bg-white overflow-hidden flex flex-col">
        
        <section id="header" className="flex flex-col w-full items-center justify-between p-4 md:p-6 text-center">
          <img src="/sulogo.png" className='w-20 h-20 md:w-40 md:h-40 pb-3' alt="eRick Ross Logo" />
          
          <h1 className="text-2xl md:text-4xl w-full font-bold text-primary"> 
            Welcome To eRick Ross!
          </h1>
          <p className="text-xs md:text-sm pt-4 text-secondary font-bold">
            Electronic Response Intelligence for Campus Knowledge & Support
          </p>
        </section>

        <section id="faq" className="flex flex-col items-center p-4 md:p-6">
          <p className='font-bold text-lg pb-4 text-primary uppercase tracking-wide'>FAQ</p>
          
          <div className='grid grid-cols-2 md:grid-cols-3 gap-3 w-full auto-rows-fr'>
            {faqs.map((faq, index) => (
              <FaqButton 
                key={index} 
                onClick={() => alert(`You clicked on ${faq}`)} 
                text={faq} 
              />
            ))}
          </div>
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
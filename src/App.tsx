import './App.css'
import ChatField from './Components/ChatField'
import FaqButton from './Components/FaqButton'
import { useNavigate } from "react-router";


export async function loader() {
  // Home page doesn't need env vars since it just navigates
  return null;
}


function App() {
  const navigate = useNavigate();

  const faqs = [
    {
      label: "Item Booking",
      prompt: "How can I book equipment like cameras or other media gear at Sampoerna University?"
    },
    {
      label: "Academic advising",
      prompt: "How does academic advising work and how can I contact my academic advisor?"
    },
    {
      label: "UKM List",
      prompt: "What student organizations (UKM) are available at Sampoerna University?"
    },
    {
      label: "Booking Room",
      prompt: "How can I book a room or facility at Sampoerna University?"
    },
    {
      label: "Course Prerequisites",
      prompt: "How do course prerequisites work and how can I check them?"
    },
    {
      label: "Calendar",
      prompt: "Where can I find the academic calendar and important semester dates?"
    },
    {
      label: "Contacts",
      prompt: "What are the important contact emails for departments like SPAC, Academic Registry, or Student Affairs?"
    },
    {
      label: "Subject Taking Plan",
      prompt: "How do I plan my courses and determine how many credits I can take next semester?"
    },
    {
      label: "Handbook Policy",
      prompt: "What are the key academic policies in the student handbook?"
    },
    {
      label: "Tutoring",
      prompt: "Are there tutoring or academic support services available for students?"
    },
    {
      label: "Class Schedule",
      prompt: "How can I check my class schedule or course timings?"
    },
    {
      label: "Tuition fee payment",
      prompt: "How do I pay tuition fees and who should I contact for payment issues?"
    }
  ]

  const handleSend = (message: string) => {
    // Navigate to /chat and pass the initial message as route state
    navigate('/chat', { state: { initialMessage: message } });
  };

  return (
    <div data-re-aoi-name="chat-input" className="flex flex-col items-center pb-20 justify-center min-h-screen bg-primary px-3 py-3 overflow-x-hidden">
      <div
        id="app"
        className="mb-4 w-full max-w-3xl shadow-md shadow-secondary/40 rounded-3xl bg-white overflow-hidden flex flex-col"
      >
        <section
          id="header"
          className="flex flex-col w-full items-center justify-between p-4 md:p-6 text-center"
        >
          <img
            src="/sulogo.png"
            className="w-20 h-20 md:w-40 md:h-40 pb-3"
            alt="eRick Ross Logo"
          />

          <h1 className="text-2xl md:text-4xl w-full font-bold text-primary">
            Welcome To eRick Ross!
          </h1>
          <p className="text-xs md:text-sm pt-4 text-secondary font-bold">
            Electronic Response Intelligence for Campus Knowledge & Support
          </p>
        </section>

        <section id="faq" className="flex flex-col items-center p-4 md:p-6">
          <p className="font-bold text-lg pb-4 text-primary uppercase tracking-wide">
            FAQ
          </p>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 w-full auto-rows-fr">
            {faqs.map((faq, index) => (
              <FaqButton
                key={index}
                onClick={() => handleSend(faq.prompt)}
                text={faq.label}
              />
            ))}
          </div>
        </section>
      </div>
      <div className="fixed bottom-2 left-0 w-full px-3 pb-3 bg-primary">
        <div className="max-w-3xl mx-auto shadow-md shadow-secondary/40 rounded-3xl bg-white p-2">
          <ChatField onSend={handleSend} />
        </div>
      </div>
    </div>
  );
}

export default App
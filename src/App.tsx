import { useNavigate } from 'react-router';
import './App.css';

function App() {
    const navigate = useNavigate();
    function handleClick() {
        navigate('/game')
    }
    return (
        <div className="bg-black w-screen h-screen text-white">
            <button onClick={handleClick} className='bg-gray-700'> Create room </button>
            <button onClick={handleClick} className='bg-gray-700'> Join room </button>
        </div>
    )
}

export default App

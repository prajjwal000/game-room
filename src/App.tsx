import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button'
import './App.css';

function App() {
    const navigate = useNavigate();
    function handleClick() {
        navigate('/game')
    }
    return (
        <div className="">
            <Button onClick={handleClick}> Create room </Button>
            <Button onClick={handleClick}> Join room </Button>
        </div>
    )
}

export default App

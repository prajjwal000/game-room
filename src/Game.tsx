// import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import './App.css';
import { Button } from './components/ui/button';

function Game() {

    const navigate = useNavigate();
    function handleClick(){
        navigate('/')
    }

    return (
        <>
            <div className='bg-black w-screen h-screen'>
                <Button onClick={handleClick}>Leave</Button>
            </div>
        </>
    )
}

export default Game

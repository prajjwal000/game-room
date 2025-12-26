// import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import './App.css';

export default function Game() {

    const navigate = useNavigate();
    function handleClick(){
        navigate('/')
    }

    return (
        <>
            <div className='bg-black w-screen h-screen text-white fixed'>
                <button onClick={handleClick} className='bg-gray-700'>Leave</button>
                <div className='h-screen'> </div>
                <p> some text </p>
            </div>
        </>
    )
}


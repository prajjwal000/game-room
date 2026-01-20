import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import "./App.css";

function Board() {
    return (
        <>
            <p> Board </p>
        </>
    );
}

export default function Game() {
    const navigate = useNavigate();
    function handleClick() {
        navigate("/");
    }

    const animationFrameId = useRef<null | number>(null);
    const timeHistory = useRef(0);
    const gameloop = (timestamp: DOMHighResTimeStamp) => {
        const delta = timestamp - timeHistory.current;
        timeHistory.current = timestamp;
        console.log(timestamp);

        if (timestamp < 10000) {
            animationFrameId.current = requestAnimationFrame(gameloop);
        }
    };

    useEffect(() => {
        animationFrameId.current = requestAnimationFrame(gameloop);

        return () => {
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
        };
    }, []);

    return (
        <>
            <div className="bg-gray-700 w-screen h-screen">
                <div className="flex justify-center-safe container">
                    <button onClick={handleClick} className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-full">
                        Leave
                    </button>
                </div>
                <div className="container">
                    <Board/>
                </div>
            </div>
        </>
    );
}

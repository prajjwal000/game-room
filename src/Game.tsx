import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import "./App.css";

function Board() {
    return (
        <>
            <p> lovely </p>
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
            <div className="bg-black w-screen h-screen text-gray-700">
                <button onClick={handleClick} className="bg-white">
                    Leave
                </button>
            </div>
        </>
    );
}

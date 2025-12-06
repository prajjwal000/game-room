import { useState, useEffect, useRef } from 'react';
import './App.css';

const GAMESPEED = 0.5;

function App() {
    const window_props = useWindowProps();
    const [padle1, set_padle1] = window_props.padle1
    const [padle2, set_padle2] = window_props.padle2

    const animation_frame_id = useRef<null | number>(null);
    const last_update_time = useRef(0);
    const pressed_keys = useRef<{ [key: string]: boolean }>({});

    const game_loop = (timestamp: DOMHighResTimeStamp) => {
        const delta = timestamp - last_update_time.current;
        last_update_time.current = timestamp;


        set_padle1(prev => {
            const new_x = prev.x;
            let new_y = prev.y;

            if (pressed_keys.current['ArrowUp']) {
                new_y -= GAMESPEED * delta;
            }
            if (pressed_keys.current['ArrowDown']) {
                new_y += GAMESPEED * delta;
            }

            return { x: new_x, y: new_y };
        });

        set_padle2(prev => {
            const new_x = prev.x;
            let new_y = prev.y;

            if (pressed_keys.current['w']) {
                new_y -= GAMESPEED * delta;
            }
            if (pressed_keys.current['s']) {
                new_y += GAMESPEED * delta;
            }

            return { x: new_x, y: new_y };
        });

        animation_frame_id.current = requestAnimationFrame(game_loop);
    }

    useEffect(() => {
        animation_frame_id.current = requestAnimationFrame(game_loop);
        return () => {
            if (animation_frame_id.current) {
                cancelAnimationFrame(animation_frame_id.current);
            }
        }
    },);

    useEffect(() => {
        const handle_key_down = (e: KeyboardEvent) => {
            pressed_keys.current[e.key] = true;
        };
        const handle_key_up = (e: KeyboardEvent) => {
            pressed_keys.current[e.key] = false;
        };

        window.addEventListener('keydown', handle_key_down);
        window.addEventListener('keyup', handle_key_up);
        return () => {
            window.removeEventListener('keydown', handle_key_down);
            window.removeEventListener('keyup', handle_key_up);
        };
    }, []);

    return (
        <div className='bg-black w-screen h-screen'>
            <Padel pos={padle1} />
            <Padel pos={padle2} />
        </div>
    )
}

function Padel({ pos }: { pos: { x: number, y: number } }) {

    return (
        <div className="bg-white absolute w-[15px] h-[150px] "
            style={{
                marginTop: `${pos.y}px`,
                marginLeft: `${pos.x}px`
            }}
        ></div>
    )
}

function useWindowProps() {
    const [padle1, set_padle1] = useState({ x: 1, y: window.innerHeight / 2 - 75 });
    const [padle2, set_padle2] = useState({ x: window.innerWidth - 16, y: window.innerHeight / 2 - 75 });
    const prev_window = useRef({ width: window.innerWidth, height: window.innerHeight })

    useEffect(() => {
        function handleResize() {
            const curr = { width: innerWidth, height: window.innerHeight }
            console.log(curr)

            set_padle1({ x: 1, y: window.innerHeight / 2 - 75 })
            set_padle2({ x: window.innerWidth - 16, y: window.innerHeight / 2 - 75 })
            prev_window.current = { width: window.innerWidth, height: window.innerHeight }
        }

        window.addEventListener('resize', handleResize);

        return () => window.removeEventListener('resize', handleResize);
    }, []);

    return { padle1: [padle1, set_padle1], padle2: [padle2, set_padle2] } as const;
}

export default App


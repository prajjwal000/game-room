import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import "./App.css";

function generateMaze(width: number, height: number): number[][] {
    const maze = Array(height).fill(null).map(() => Array(width).fill(1));
    const stack: [number, number][] = [];
    const visited = Array(height).fill(null).map(() => Array(width).fill(false));
    
    const directions = [
        [0, -2], [2, 0], [0, 2], [-2, 0]
    ];
    
    function getUnvisitedNeighbors(x: number, y: number): [number, number][] {
        const neighbors: [number, number][] = [];
        for (const [dx, dy] of directions) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height && !visited[ny][nx]) {
                neighbors.push([nx, ny]);
            }
        }
        return neighbors;
    }
    
    function removeWall(x1: number, y1: number, x2: number, y2: number) {
        const wallX = (x1 + x2) / 2;
        const wallY = (y1 + y2) / 2;
        maze[wallY][wallX] = 0;
        maze[y2][x2] = 0;
    }
    
    let currentX = 0;
    let currentY = 0;
    maze[currentY][currentX] = 0;
    visited[currentY][currentX] = true;
    stack.push([currentX, currentY]);
    
    while (stack.length > 0) {
        const neighbors = getUnvisitedNeighbors(currentX, currentY);
        
        if (neighbors.length > 0) {
            const [nextX, nextY] = neighbors[Math.floor(Math.random() * neighbors.length)];
            removeWall(currentX, currentY, nextX, nextY);
            visited[nextY][nextX] = true;
            stack.push([nextX, nextY]);
            currentX = nextX;
            currentY = nextY;
        } else {
            [currentX, currentY] = stack.pop()!;
        }
    }
    
    return maze;
}

function Board({ board_arr }: { board_arr: number[][] }) {
    const rows = board_arr.length;
    const columns = board_arr[0].length;
    return (
        <>
            <div
                className="grid"
                style={{
                    'grid-template-rows': `repeat(${rows}, 4px)`,
                    'grid-template-columns': `repeat(${columns}, 4px)`
                }}
            >

                {board_arr.map((row,i) => 
                    row.map( (cell,j) => (
                       <div 
                            key={`${i}-${j}`}  
                            className={`${cell === 0 ? "bg-white" : "bg-black"}`}
                      />  
                    ))
                )
                }

            </div>
        </>
    );
}

export default function Game() {
    //TODO: maybe take out react router and just use browser api
    const navigate = useNavigate();
    function handleClick() {
        navigate("/");
    }

    const board_arr = generateMaze(81,81);  
    const animationFrameId = useRef<null | number>(null);
    const timeHistory = useRef(0);

    // TODO: maybe a good place to use useCallback
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
                    <Board board_arr={board_arr}/>
                </div>
            </div> 
        </>
    );
}

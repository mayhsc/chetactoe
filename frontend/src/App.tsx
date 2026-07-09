import './App.css';

function App() {
  const renderBoard = () => {
    const squares = [];
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        const isBlack = (i + j) % 2 === 0;
        const colorClass = isBlack ? 'box black' : 'box white';
        
        squares.push(
          <div 
            key={`${i}-${j}`} 
            className={colorClass}
            onClick={() => console.log(`Clicked cell row ${i}, col ${j}`)}
          />
        );
      }
    }
    return squares;
  };

  return (
    <div className="app-container">
      <div className="board-grid">
        {renderBoard()}
      </div>
    </div>
  );
}

export default App;

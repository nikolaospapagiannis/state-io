# State.io Clone

A modern clone of the State.io territory conquest strategy game, built with Phaser 3, TypeScript, and Capacitor for cross-platform deployment.

## Features

- **10 Levels** - Progressive difficulty from easy tutorials to extreme challenges
- **Multiple AI Opponents** - Up to 4 AI players with difficulty-based behavior
- **Modern 2026 Graphics** - Neon glow effects, particle systems, smooth animations
- **Touch & Mouse Controls** - Drag from your territory to attack others
- **Responsive Design** - Works on desktop and mobile devices
- **Progress Saving** - Unlocked levels and high scores saved locally
- **Sound Effects** - Generated audio for game events
- **Cross-Platform** - Web, Android, and iOS via Capacitor

## Tech Stack

- **Phaser 3.80** - Game framework
- **TypeScript** - Type-safe development
- **Vite** - Fast build tool
- **Capacitor** - Native mobile deployment

## Quick Start

### Web Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Mobile Deployment

```bash
# Build web assets first
npm run build

# Initialize Capacitor (first time only)
npx cap init StateIO com.stateio.game --web-dir dist

# Add Android platform
npx cap add android

# Add iOS platform (macOS only)
npx cap add ios

# Sync web assets to native projects
npx cap sync

# Open Android Studio
npx cap open android

# Open Xcode (macOS only)
npx cap open ios
```

## How to Play

1. **Tap & Drag** - Tap your territory (cyan) and drag to another territory to send troops
2. **Capture** - When your troops outnumber the defenders, you capture the territory
3. **Generate** - Each owned territory generates 1 troop per second
4. **Win** - Eliminate all enemy territories (colored) to win
5. **Strategy** - Don't spread too thin! Balance attack and defense

## Project Structure

```
state-io/
├── src/
│   ├── config/        # Game configuration and levels
│   ├── entities/      # Game objects (Territory, Troop)
│   ├── scenes/        # Phaser scenes (Menu, Game, UI, Victory)
│   ├── systems/       # Game systems (AI Controller)
│   └── main.ts        # Entry point
├── index.html         # HTML template
├── capacitor.config.ts # Mobile config
└── vite.config.ts     # Build config
```

## Level Difficulty

| Difficulty | AI Speed | Attack Chance | AI Count |
|------------|----------|---------------|----------|
| Easy       | Slow     | 20%           | 1        |
| Medium     | Normal   | 35%           | 1-2      |
| Hard       | Fast     | 50%           | 2-3      |
| Extreme    | Very Fast| 65%           | 3-4      |

## Browser Support

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## License

MIT

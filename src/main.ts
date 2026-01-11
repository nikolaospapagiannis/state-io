import Phaser from 'phaser';
import { CONFIG } from './config/GameConfig';
import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';
import { VictoryScene } from './scenes/VictoryScene';
import { LevelSelectScene } from './scenes/LevelSelectScene';

// Add all scenes to config
const gameConfig: Phaser.Types.Core.GameConfig = {
  ...CONFIG,
  scene: [
    BootScene,
    PreloadScene,
    MenuScene,
    LevelSelectScene,
    GameScene,
    UIScene,
    VictoryScene,
  ],
};

// Create game instance
const game = new Phaser.Game(gameConfig);

// Handle resize
window.addEventListener('resize', () => {
  game.scale.refresh();
});

// Handle visibility change (pause when tab is hidden)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    game.scene.scenes.forEach((scene) => {
      if (scene.scene.isActive()) {
        scene.scene.pause();
      }
    });
  } else {
    game.scene.scenes.forEach((scene) => {
      if (scene.scene.isPaused()) {
        scene.scene.resume();
      }
    });
  }
});

// Expose game for debugging in development
if (import.meta.env.DEV) {
  (window as unknown as { game: Phaser.Game }).game = game;
}

export default game;

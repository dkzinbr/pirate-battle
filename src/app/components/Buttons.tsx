import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { audio, type SoundName } from '../../audio/AudioEngine';
import { iconSources, type IconName } from './icons';

interface GameButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
  size?: 'md' | 'small';
  sound?: SoundName | null;
  children: ReactNode;
}

export function GameButton({ variant = 'primary', size = 'md', sound = 'ui_click', className, onClick, ...rest }: GameButtonProps) {
  const classes = ['btn', variant === 'secondary' && 'btn--secondary', size === 'small' && 'btn--small', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type="button"
      className={classes}
      onClick={(event) => {
        audio.unlock();
        if (sound) audio.play(sound, { volume: 0.6 });
        onClick?.(event);
      }}
      {...rest}
    />
  );
}

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: IconName;
  label: string;
  sound?: SoundName | null;
}

export function IconButton({ icon, label, sound = 'ui_click', className, onClick, ...rest }: IconButtonProps) {
  const { src, srcSet } = iconSources(icon);
  return (
    <button
      type="button"
      className={['round-btn', className].filter(Boolean).join(' ')}
      aria-label={label}
      title={label}
      onClick={(event) => {
        audio.unlock();
        if (sound) audio.play(sound, { volume: 0.6 });
        onClick?.(event);
      }}
      {...rest}
    >
      <img src={src} srcSet={srcSet} alt="" draggable={false} />
    </button>
  );
}

export function Icon({ name, className }: { name: IconName; className?: string }) {
  const { src, srcSet } = iconSources(name);
  return <img className={className} src={src} srcSet={srcSet} alt="" draggable={false} />;
}

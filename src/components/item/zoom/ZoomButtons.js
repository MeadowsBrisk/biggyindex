"use client";
import React from 'react';
import cn from "@/lib/core/cn";
import { useTranslations } from 'next-intl';

export function ZoomIconButton({ onClick, label, children, small=false }){
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex items-center justify-center font-semibold rounded-full border shadow-sm text-gray-800 dark:text-gray-100",
        "bg-white/90 dark:bg-gray-900/70 border-white/40 dark:border-gray-700 backdrop-blur-sm",
        "hover:bg-white dark:hover:bg-gray-800 transition-colors",
        small ? 'w-9 h-9 text-xs' : 'w-11 h-11 text-sm'
      )}
    >{children}</button>
  );
}

export function ZoomButton({ onClick, icon, label, small }){
  return <ZoomIconButton onClick={onClick} label={label} small={small}>{icon}</ZoomIconButton>;
}

export function ToggleGifButton({ playing, onToggle, small, disabled }) {
  const t = useTranslations('Zoom');
  return (
    <ZoomIconButton
      onClick={disabled ? undefined : onToggle}
      label={playing ? (disabled ? t('gifPausedGlobal', { default: 'GIF paused (global)' }) : t('pauseGif')) : (disabled ? t('gifPausedGlobal', { default: 'GIF paused (global)' }) : t('playGif'))}
      small={small}
    >
      <span className={disabled ? 'opacity-60 cursor-not-allowed' : ''}>{playing ? t('pause') : t('play')}</span>
    </ZoomIconButton>
  );
}

export function RotateButton({ dir, onClick }) {
  const t = useTranslations('Zoom');
  const left = dir === 'left';
  return (
    <ZoomIconButton onClick={onClick} label={left ? t('rotateLeft') : t('rotateRight')}>
      {left ? (
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 1 9 9"/><polyline points="3 12 3 18 9 18"/></svg>
      ) : (
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 0-9 9"/><polyline points="21 12 21 18 15 18"/></svg>
      )}
    </ZoomIconButton>
  );
}

export function ArrowLeftIcon(props){ return <svg viewBox="0 0 24 24" className={cn("w-5 h-5", props.className)} fill="none" stroke="currentColor" strokeWidth={2}><path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
export function ArrowRightIcon(props){ return <svg viewBox="0 0 24 24" className={cn("w-5 h-5", props.className)} fill="none" stroke="currentColor" strokeWidth={2}><path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round"/></svg>; }

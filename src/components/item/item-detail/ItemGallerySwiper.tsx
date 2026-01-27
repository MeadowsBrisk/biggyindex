"use client";
import React, { useState, useCallback, memo } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Keyboard, EffectFade, FreeMode } from 'swiper/modules';
import 'swiper/css/effect-fade';
import 'swiper/css';
import 'swiper/css/free-mode';
import 'swiper/css/navigation';
import { proxyImage } from '@/lib/ui/images';
import cn from '@/lib/core/cn';
import FavButton from '@/components/actions/FavButton';
import { useTranslations } from 'next-intl';

interface ItemGallerySwiperProps {
    images: string[];
    name: string;
    isFav: boolean;
    itemId: string | number | null;
    onImageClick: (index: number) => void;
}

/**
 * Isolated image gallery with Swiper.
 * Manages its own activeSlide/mainSwiper state so parent doesn't re-render on swipe.
 * Wrapped in React.memo for additional isolation.
 */
function ItemGallerySwiperInner({
    images,
    name,
    isFav,
    itemId,
    onImageClick,
}: ItemGallerySwiperProps) {
    const tOv = useTranslations('Overlay');
    const [activeSlide, setActiveSlide] = useState(0);
    const [mainSwiper, setMainSwiper] = useState<any>(null);

    const handleImageClick = useCallback((idx: number) => {
        onImageClick(idx);
    }, [onImageClick]);

    if (images.length === 0) {
        return (
            <div
                className="image-border"
                style={{ '--image-border-radius': '0.5rem', '--image-border-padding': '2.5px' } as React.CSSProperties}
            >
                <div className="image-border-inner relative w-full aspect-square flex items-center justify-center border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-100 dark:bg-gray-800">
                    <div className="w-12 h-12 rounded-full border-4 border-gray-300 dark:border-gray-600 border-t-blue-500 animate-spin" />
                </div>
            </div>
        );
    }

    return (
        <>
            <div
                className={cn(
                    "image-border",
                    isFav && "fav-thumb-shadow"
                )}
                style={{ '--image-border-radius': '0.5rem', '--image-border-padding': '2.5px' } as React.CSSProperties}
            >
                <div
                    className={cn(
                        "image-border-inner relative group border bg-gray-100 dark:bg-gray-800",
                        isFav ? "fav-thumb-border" : 'border-gray-200 dark:border-gray-700'
                    )}
                >
                    {/* Fav button on image for sub-ultrawide screens */}
                    <div className="absolute right-2 top-2 z-10 hidden md:block 2xl:hidden">
                        {itemId && <FavButton itemId={itemId} />}
                    </div>
                    <Swiper
                        modules={[Keyboard, EffectFade]}
                        effect="fade"
                        fadeEffect={{ crossFade: true }}
                        keyboard={{ enabled: true }}
                        spaceBetween={0}
                        slidesPerView={1}
                        onSwiper={setMainSwiper}
                        onSlideChange={(sw) => setActiveSlide((sw as any).activeIndex || 0)}
                        className="w-full aspect-square minimal-swiper"
                    >
                        {images.map((src, idx) => (
                            <SwiperSlide key={idx + src} className="!h-full">
                                <button
                                    type="button"
                                    onClick={() => handleImageClick(idx)}
                                    className="w-full h-full focus:outline-none focus-visible:ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-900 ring-blue-500"
                                >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={proxyImage(src)}
                                        alt={name}
                                        loading={idx === 0 ? 'eager' : 'lazy'}
                                        decoding="async"
                                        draggable={false}
                                        className="object-cover w-full h-full select-none cursor-zoom-in transition-transform duration-900 ease-out group-hover:scale-[1.04]"
                                    />
                                </button>
                            </SwiperSlide>
                        ))}
                    </Swiper>
                    {images.length > 1 && (
                        <div className="pointer-events-none absolute top-1 right-1 text-[11px] px-1.5 py-0.5 rounded-md bg-black/55 backdrop-blur-sm text-white/90 font-mono shadow-sm">
                            {activeSlide + 1}<span className="opacity-60">/</span>{images.length}
                        </div>
                    )}
                </div>
            </div>
            {images.length > 1 && (
                <div>
                    <Swiper
                        modules={[FreeMode]}
                        spaceBetween={8}
                        slidesPerView={Math.min(images.length, 6)}
                        freeMode
                        watchSlidesProgress
                    >
                        {images.map((src, idx) => (
                            <SwiperSlide key={'thumb-' + idx} className="!w-auto">
                                <button
                                    type="button"
                                    onClick={() => mainSwiper && (mainSwiper as any).slideTo(idx)}
                                    className={cn(
                                        'relative w-14 h-14 rounded overflow-hidden border',
                                        activeSlide === idx
                                            ? 'ring-2 ring-blue-500 border-transparent'
                                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                                    )}
                                    aria-label={tOv('goToImage', { num: idx + 1 })}
                                    title={tOv('imageNum', { num: idx + 1 })}
                                >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={proxyImage(src, 112)} alt="thumb" className="w-full h-full object-cover" />
                                </button>
                            </SwiperSlide>
                        ))}
                    </Swiper>
                </div>
            )}
        </>
    );
}

const ItemGallerySwiper = memo(ItemGallerySwiperInner);
export default ItemGallerySwiper;

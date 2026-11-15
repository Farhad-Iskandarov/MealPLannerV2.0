import React from 'react';
import { SupermarketSlug } from '../../shared/types';

export const ChefHatLogo: React.FC<{ size?: number }> = ({ size = 44 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="64" height="64" rx="16" fill="url(#mpGrad)" />
    <path
      d="M22 46V38C17.5 36.8 15 32.8 15 28.5C15 23.5 19 19.5 23.8 19.5C25.5 15.8 28.5 14 32 14C35.5 14 38.5 15.8 40.2 19.5C45 19.5 49 23.5 49 28.5C49 32.8 46.5 36.8 42 38V46C42 47.7 40.7 49 39 49H25C23.3 49 22 47.7 22 46Z"
      stroke="white"
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M22 42H42" stroke="white" strokeWidth="3" strokeLinecap="round" />
    <defs>
      <linearGradient id="mpGrad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
        <stop stopColor="#2E9B47" />
        <stop offset="1" stopColor="#165B28" />
      </linearGradient>
    </defs>
  </svg>
);

export const SupermarketLogo: React.FC<{ store: SupermarketSlug; size?: number }> = ({
  store,
  size = 34,
}) => {
  if (store === 'biedronka') {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="24" r="22" fill="#FFF3B0" stroke="#F0D543" strokeWidth="1.5" />
        <ellipse cx="24" cy="26" rx="12" ry="13" fill="#E30613" />
        <path d="M16 17C18 12 30 12 32 17Z" fill="#1E1E1E" />
        <line x1="24" y1="16" x2="24" y2="39" stroke="#1E1E1E" strokeWidth="2" />
        <circle cx="19" cy="23" r="2.2" fill="#1E1E1E" />
        <circle cx="29" cy="23" r="2.2" fill="#1E1E1E" />
        <circle cx="18" cy="31" r="2" fill="#1E1E1E" />
        <circle cx="30" cy="31" r="2" fill="#1E1E1E" />
        <circle cx="21" cy="14" r="1.3" fill="white" />
        <circle cx="27" cy="14" r="1.3" fill="white" />
      </svg>
    );
  }
  if (store === 'lidl') {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect width="48" height="48" rx="12" fill="#0050AA" />
        <circle cx="24" cy="24" r="17" fill="#FFF000" stroke="#E30613" strokeWidth="2.5" />
        <text
          x="24"
          y="29"
          textAnchor="middle"
          fill="#0050AA"
          fontFamily="Arial, sans-serif"
          fontWeight="900"
          fontSize="12"
        >
          LIDL
        </text>
      </svg>
    );
  }
  if (store === 'auchan') {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect width="48" height="48" rx="12" fill="#FFF0F2" stroke="#FAD0D6" strokeWidth="1.5" />
        <path d="M15 35L24 12L33 35H28L26.2 30H21.8L20 35H15Z" fill="#E0001A" />
        <circle cx="24" cy="23" r="2.5" fill="#1E8B45" />
      </svg>
    );
  }
  if (store === 'kaufland') {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect width="48" height="48" rx="12" fill="#FFF0F2" stroke="#FAD0D6" strokeWidth="1.5" />
        <rect x="10" y="10" width="28" height="28" rx="4" stroke="#E10915" strokeWidth="2.5" />
        <path d="M17 15V33M17 24L29 15M21 21L30 33" stroke="#E10915" strokeWidth="3.2" strokeLinecap="round" />
      </svg>
    );
  }
  if (store === 'carrefour') {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect width="48" height="48" rx="12" fill="#EEF4FF" stroke="#C5D8FF" strokeWidth="1.5" />
        <path d="M24 10L38 24L24 38L10 24L24 10Z" fill="#004E9E" />
        <text x="24" y="29" textAnchor="middle" fill="#FFFFFF" fontFamily="Arial, sans-serif" fontWeight="900" fontSize="14">
          C
        </text>
      </svg>
    );
  }
  if (store === 'zabka') {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect width="48" height="48" rx="12" fill="#00682E" />
        <text x="24" y="29" textAnchor="middle" fill="#A6EA47" fontFamily="Arial, sans-serif" fontWeight="900" fontSize="11">
          żabka
        </text>
      </svg>
    );
  }
  if (store === 'bravo') {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect width="48" height="48" rx="12" fill="#5DBB2E" />
        <circle cx="24" cy="24" r="16" fill="#46991D" />
        <text x="24" y="28" textAnchor="middle" fill="#FFFFFF" fontFamily="Arial, sans-serif" fontWeight="900" fontSize="9.5">
          BRAVO
        </text>
      </svg>
    );
  }
  if (store === 'araz') {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect width="48" height="48" rx="12" fill="#1E8B45" />
        <circle cx="24" cy="24" r="15" fill="#F9B200" />
        <text x="24" y="28" textAnchor="middle" fill="#124724" fontFamily="Arial, sans-serif" fontWeight="900" fontSize="10.5">
          ARAZ
        </text>
      </svg>
    );
  }
  if (store === 'bazarstore') {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect width="48" height="48" rx="12" fill="#E65100" />
        <text x="24" y="23" textAnchor="middle" fill="#FFFFFF" fontFamily="Arial, sans-serif" fontWeight="900" fontSize="9">
          BAZAR
        </text>
        <text x="24" y="33" textAnchor="middle" fill="#FFE082" fontFamily="Arial, sans-serif" fontWeight="800" fontSize="8.5">
          STORE
        </text>
      </svg>
    );
  }
  if (store === 'rahat') {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect width="48" height="48" rx="12" fill="#C62828" />
        <text x="24" y="28" textAnchor="middle" fill="#FFFFFF" fontFamily="Arial, sans-serif" fontWeight="900" fontSize="10">
          RAHAT
        </text>
      </svg>
    );
  }
  if (store === 'oba') {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect width="48" height="48" rx="12" fill="#2E7D32" />
        <circle cx="24" cy="24" r="15" fill="#FDD835" />
        <text x="24" y="29" textAnchor="middle" fill="#1B5E20" fontFamily="Arial, sans-serif" fontWeight="900" fontSize="12">
          OBA
        </text>
      </svg>
    );
  }
  // birmarket or fallback
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <rect width="48" height="48" rx="12" fill="#D81B60" />
      <text x="24" y="23" textAnchor="middle" fill="#FFFFFF" fontFamily="Arial, sans-serif" fontWeight="900" fontSize="9">
        BIR
      </text>
      <text x="24" y="33" textAnchor="middle" fill="#FCE4EC" fontFamily="Arial, sans-serif" fontWeight="800" fontSize="8">
        MARKET
      </text>
    </svg>
  );
};

export const AndroidStatusBar: React.FC<{ darkText?: boolean }> = ({ darkText = true }) => {
  const color = darkText ? '#1E2420' : '#FFFFFF';
  return (
    <div className="mp-status-bar" style={{ color }}>
      <span className="mp-status-time">12:30</span>
      <div className="mp-camera-punch" />
      <div className="mp-status-icons">
        {/* Signal */}
        <svg width="13" height="11" viewBox="0 0 14 12" fill={color}>
          <path d="M1 11H3V8H1V11ZM4.5 11H6.5V6H4.5V11ZM8 11H10V3.5H8V11ZM11.5 11H13.5V1H11.5V11Z" />
        </svg>
        {/* Wifi */}
        <svg width="13" height="11" viewBox="0 0 16 12" fill={color}>
          <path d="M8 9.5C8.8 9.5 9.5 10.2 9.5 11C9.5 11.8 8.8 12.5 8 12.5C7.2 12.5 6.5 11.8 6.5 11C6.5 10.2 7.2 9.5 8 9.5ZM8 6C10.1 6 12 6.8 13.4 8.2L12 9.6C11 8.6 9.6 8 8 8C6.4 8 5 8.6 4 9.6L2.6 8.2C4 6.8 5.9 6 8 6ZM8 2C11.2 2 14.1 3.3 16.2 5.4L14.8 6.8C13.1 5.1 10.7 4 8 4C5.3 4 2.9 5.1 1.2 6.8L-0.2 5.4C1.9 3.3 4.8 2 8 2Z" />
        </svg>
        {/* Battery */}
        <svg width="16" height="11" viewBox="0 0 18 11" fill={color}>
          <rect x="1" y="1.5" width="13" height="8" rx="1.5" stroke={color} strokeWidth="1.3" fill="none" />
          <rect x="2.5" y="3" width="10" height="5" rx="0.8" fill={color} />
          <rect x="15" y="3.5" width="1.8" height="4" rx="0.6" fill={color} />
        </svg>
      </div>
    </div>
  );
};

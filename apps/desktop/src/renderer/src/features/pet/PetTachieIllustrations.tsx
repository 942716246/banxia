import React from 'react'
import type { BanXiaTachie } from '@baishou/shared'

interface TachieProps {
  tachie: BanXiaTachie
  isSpeaking?: boolean
  className?: string
}

/**
 * 半夏（Banxia）原生内置矢量立绘
 *
 * 角色外貌：南方二线城市画师、矮个子宅女、黑色短发、微圆脸、居家宽松衣服。
 * 六种情绪表情：正常、开心、害羞、生气、难过、坏笑。
 */
export const PetTachieIllustrations: React.FC<TachieProps> = ({
  tachie,
  isSpeaking = false,
  className = ''
}) => {
  return (
    <svg
      viewBox="0 0 300 450"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ width: '100%', height: '100%', overflow: 'visible' }}
    >
      <defs>
        <radialGradient id="skin" cx="50%" cy="40%" r="50%">
          <stop offset="0%" stopColor="#FFF2EC" />
          <stop offset="100%" stopColor="#FFE0D1" />
        </radialGradient>
        <linearGradient id="hair" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#353139" />
          <stop offset="100%" stopColor="#221E26" />
        </linearGradient>
        <linearGradient id="clothes" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#6C7A89" />
          <stop offset="100%" stopColor="#4F5D6B" />
        </linearGradient>
        <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="4" stdDeviation="6" floodOpacity="0.18" />
        </filter>
      </defs>

      {/* 身体与衣服 */}
      <g id="body" filter="url(#shadow)">
        {/* 脖子 */}
        <rect x="138" y="240" width="24" height="35" rx="6" fill="url(#skin)" />
        {/* 锁骨阴影 */}
        <path d="M 142 265 Q 150 270 158 265" stroke="#E5BFA8" strokeWidth="2" strokeLinecap="round" />

        {/* 宽松卫衣/画师罩衣 */}
        <path
          d="M 100 270 C 80 280, 60 330, 75 420 C 110 430, 190 430, 225 420 C 240 330, 220 280, 200 270 C 185 285, 115 285, 100 270 Z"
          fill="url(#clothes)"
        />
        {/* 衣领 */}
        <path
          d="M 120 270 Q 150 295 180 270 Q 150 280 120 270 Z"
          fill="#3B4652"
        />

        {/* 围裙/画室腰带口袋 */}
        <rect x="110" y="340" width="80" height="60" rx="8" fill="#586675" />
        {/* 口袋里的画笔 */}
        <line x1="125" y1="355" x2="115" y2="310" stroke="#C29B72" strokeWidth="4" strokeLinecap="round" />
        <line x1="135" y1="350" x2="130" y2="305" stroke="#9E4738" strokeWidth="3" strokeLinecap="round" />
        <polygon points="113,310 117,310 115,298" fill="#F0EDE6" />
      </g>

      {/* 头部与脸庞 */}
      <g id="head" filter="url(#shadow)">
        {/* 后发 */}
        <path
          d="M 85 140 C 70 200, 75 260, 95 270 C 105 275, 115 240, 115 240 L 185 240 C 185 240, 195 275, 205 270 C 225 260, 230 200, 215 140 C 200 65, 100 65, 85 140 Z"
          fill="url(#hair)"
        />

        {/* 脸蛋（可爱的微圆脸） */}
        <path
          d="M 100 150 C 95 210, 115 250, 150 250 C 185 250, 205 210, 200 150 C 200 100, 100 100, 100 150 Z"
          fill="url(#skin)"
        />

        {/* 腮红 */}
        <ellipse cx="118" cy="195" rx="14" ry="7" fill="#FF8A7A" opacity={tachie === '害羞' ? '0.6' : '0.25'} />
        <ellipse cx="182" cy="195" rx="14" ry="7" fill="#FF8A7A" opacity={tachie === '害羞' ? '0.6' : '0.25'} />

        {/* 前发刘海（带凌乱小碎发） */}
        <path
          d="M 90 140 C 95 100, 120 85, 150 85 C 180 85, 205 100, 210 140 C 200 135, 190 150, 185 145 C 175 135, 165 160, 155 145 C 145 135, 135 165, 125 145 C 115 135, 105 155, 90 140 Z"
          fill="url(#hair)"
        />

        {/* 呆毛 / 凌乱翘发 */}
        <path
          d="M 148 85 Q 140 50 160 55 Q 148 65 152 85"
          fill="url(#hair)"
        />

        {/* 动态眼睛与眉毛 */}
        {tachie === '正常' && (
          <g id="eyes-normal">
            <ellipse cx="125" cy="170" rx="9" ry="11" fill="#2E2833" />
            <circle cx="122" cy="166" r="3.5" fill="#FFFFFF" />
            <ellipse cx="175" cy="170" rx="9" ry="11" fill="#2E2833" />
            <circle cx="172" cy="166" r="3.5" fill="#FFFFFF" />
            {/* 眉毛 */}
            <path d="M 115 152 Q 125 150 135 154" stroke="#2E2833" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M 165 154 Q 175 150 185 152" stroke="#2E2833" strokeWidth="2.5" strokeLinecap="round" />
          </g>
        )}

        {tachie === '开心' && (
          <g id="eyes-happy">
            {/* 眯眼月牙笑 */}
            <path d="M 115 172 Q 125 160 135 172" stroke="#2E2833" strokeWidth="3.5" fill="none" strokeLinecap="round" />
            <path d="M 165 172 Q 175 160 185 172" stroke="#2E2833" strokeWidth="3.5" fill="none" strokeLinecap="round" />
            {/* 弯弯眉毛 */}
            <path d="M 115 148 Q 125 144 135 150" stroke="#2E2833" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M 165 150 Q 175 144 185 148" stroke="#2E2833" strokeWidth="2.5" strokeLinecap="round" />
          </g>
        )}

        {tachie === '害羞' && (
          <g id="eyes-shy">
            {/* 羞怯往斜下方看 */}
            <ellipse cx="123" cy="172" rx="8" ry="10" fill="#2E2833" />
            <circle cx="120" cy="170" r="3" fill="#FFFFFF" />
            <ellipse cx="173" cy="172" rx="8" ry="10" fill="#2E2833" />
            <circle cx="170" cy="170" r="3" fill="#FFFFFF" />
            {/* 八字羞恼小眉毛 */}
            <path d="M 116 156 Q 126 150 136 154" stroke="#2E2833" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M 164 154 Q 174 150 184 156" stroke="#2E2833" strokeWidth="2.5" strokeLinecap="round" />
            {/* 脸部斜线红晕 */}
            <line x1="112" y1="192" x2="116" y2="198" stroke="#FF4757" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="117" y1="192" x2="121" y2="198" stroke="#FF4757" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="179" y1="192" x2="183" y2="198" stroke="#FF4757" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="184" y1="192" x2="188" y2="198" stroke="#FF4757" strokeWidth="1.5" strokeLinecap="round" />
          </g>
        )}

        {tachie === '生气' && (
          <g id="eyes-angry">
            <ellipse cx="125" cy="170" rx="8" ry="10" fill="#2E2833" />
            <circle cx="123" cy="167" r="3" fill="#FFFFFF" />
            <ellipse cx="175" cy="170" rx="8" ry="10" fill="#2E2833" />
            <circle cx="173" cy="167" r="3" fill="#FFFFFF" />
            {/* 倒八字严厉眉毛 */}
            <path d="M 115 150 L 135 158" stroke="#2E2833" strokeWidth="3" strokeLinecap="round" />
            <path d="M 185 150 L 165 158" stroke="#2E2833" strokeWidth="3" strokeLinecap="round" />
            {/* 生气青筋十字 */}
            <path d="M 195 125 L 205 125 M 200 120 L 200 130" stroke="#FF4757" strokeWidth="2" strokeLinecap="round" />
          </g>
        )}

        {tachie === '难过' && (
          <g id="eyes-sad">
            <ellipse cx="125" cy="173" rx="8" ry="10" fill="#2E2833" />
            <circle cx="123" cy="170" r="3" fill="#FFFFFF" />
            <ellipse cx="175" cy="173" rx="8" ry="10" fill="#2E2833" />
            <circle cx="173" cy="170" r="3" fill="#FFFFFF" />
            {/* 下垂苦恼眉毛 */}
            <path d="M 115 156 Q 125 150 135 152" stroke="#2E2833" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M 165 152 Q 175 150 185 156" stroke="#2E2833" strokeWidth="2.5" strokeLinecap="round" />
          </g>
        )}

        {tachie === '坏笑' && (
          <g id="eyes-teasing">
            {/* 一只半睁坏笑，一只眨眼 */}
            <ellipse cx="125" cy="168" rx="8" ry="7" fill="#2E2833" />
            <circle cx="123" cy="166" r="2.5" fill="#FFFFFF" />
            {/* 右眼眨眼戏谑弧线 */}
            <path d="M 166 172 Q 175 162 184 172" stroke="#2E2833" strokeWidth="3" fill="none" strokeLinecap="round" />
            {/* 挑眉 */}
            <path d="M 115 150 Q 125 146 135 152" stroke="#2E2833" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M 165 154 Q 175 148 185 146" stroke="#2E2833" strokeWidth="2.5" strokeLinecap="round" />
          </g>
        )}

        {/* 动态嘴型 */}
        {isSpeaking ? (
          /* 说话中张嘴动画 */
          <ellipse cx="150" cy="216" rx="7" ry="6" fill="#C24949">
            <animate attributeName="ry" values="6;2;8;4;6" dur="0.4s" repeatCount="indefinite" />
          </ellipse>
        ) : tachie === '坏笑' ? (
          /* 猫猫嘴 / 调侃坏笑嘴 */
          <path d="M 142 214 Q 146 218 150 214 Q 154 218 158 214" stroke="#8A3B3B" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        ) : tachie === '开心' ? (
          /* 开心张嘴笑 */
          <path d="M 142 212 Q 150 224 158 212 Z" fill="#D65B5B" />
        ) : tachie === '生气' ? (
          /* 嘟嘴气鼓鼓 */
          <ellipse cx="150" cy="214" rx="4" ry="4" fill="#8A3B3B" />
        ) : tachie === '难过' ? (
          /* 撇嘴苦笑 */
          <path d="M 144 218 Q 150 212 156 218" stroke="#8A3B3B" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        ) : (
          /* 正常微抿嘴 */
          <path d="M 144 215 Q 150 218 156 215" stroke="#8A3B3B" strokeWidth="2" strokeLinecap="round" />
        )}
      </g>
    </svg>
  )
}

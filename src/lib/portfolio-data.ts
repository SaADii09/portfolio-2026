// ─── Personal Info ───────────────────────────────────────────────────────────

export const PERSONAL_INFO = {
  name: "Saad Ahmad",
  title: "Software Engineer (Full-Stack + AI)",
  tagline:
    "Full-stack software engineer with 2.5+ years of professional experience building production-grade web applications and AI-powered systems.",
  contact: {
    phone: "+92 317 6830879",
    email: "saadahmad6830879@gmail.com",
    links: {
      linkedin: "https://linkedin.com/in/saadahmad879",
      github: "https://github.com/SaADii09",
    },
  },
  summary: {
    highlights: [
      "2.5+ years professional experience",
      "JavaScript/TypeScript ecosystem (Next.js, Node.js)",
      "AI engineering, RAG pipelines, LangChain/LangGraph agents",
      "End-to-end SaaS and AI-driven product delivery",
    ],
    paragraphs: [
      "Full-stack software engineer with 2.5+ years of professional experience building production-grade web applications and AI-powered systems.",
      "Specialized in the JavaScript/TypeScript ecosystem (Next.js, Node.js) with hands-on expertise in AI engineering, RAG pipelines, LangChain/LangGraph agents, and OpenAI API integrations.",
      "Proven record of delivering end-to-end SaaS and AI-driven products, from system architecture to production deployment, across CRM, job portal, and real-time communication platforms.",
    ],
  },
} as const;

// ─── Skills ──────────────────────────────────────────────────────────────────

export type SkillCategory = {
  category: string;
  icon: string;
  items: string[];
};

export const SKILLS: SkillCategory[] = [
  {
    category: "Languages",
    icon: "Code2",
    items: [
      "JavaScript (ES2024+)",
      "TypeScript",
      "Python",
      "C#",
      "HTML5",
      "CSS3",
      "SQL",
    ],
  },
  {
    category: "Frontend & Mobile",
    icon: "Layout",
    items: [
      "Next.js",
      "React.js",
      "React Native",
      "Expo",
      "Redux Toolkit",
      "TanStack Query",
      "Tailwind CSS",
      "shadcn/ui",
      "Axios",
      "Flutter",
    ],
  },
  {
    category: "Backend & APIs",
    icon: "Server",
    items: [
      "Node.js",
      "Express.js",
      "NestJS",
      "FastAPI",
      "Convex",
      "Strapi CMS",
      "REST APIs",
      "WebSockets",
      "WebRTC",
      "JWT",
      "Zod",
      "Auth & RBAC",
    ],
  },
  {
    category: "Databases & Storage",
    icon: "Database",
    items: [
      "PostgreSQL",
      "MongoDB",
      "Redis",
      "Firebase",
      "Supabase",
      "Pinecone",
      "Amazon S3",
      "Mem0",
      "Zep",
    ],
  },
  {
    category: "AI & Agents",
    icon: "Brain",
    items: [
      "LangChain",
      "LangGraph",
      "RAG Pipelines",
      "Embeddings",
      "OpenAI APIs",
      "Prompt Engineering",
      "Context Engineering",
      "Agent Memory",
      "Tool Calling",
      "Multi-Agent Systems",
    ],
  },
  {
    category: "Cloud & DevOps",
    icon: "Cloud",
    items: [
      "AWS EC2",
      "Docker",
      "Nginx",
      "PM2",
      "Vercel",
      "GitHub Actions",
      "CI/CD Pipelines",
      "Git",
      "GitHub",
      "Linux",
    ],
  },
  {
    category: "Integrations & Payments",
    icon: "Plug",
    items: [
      "Stripe",
      "Clerk",
      "Twilio",
      "Facebook API",
      "LinkedIn API",
      "n8n",
      "Postman",
    ],
  },
  {
    category: "Architecture & Patterns",
    icon: "Network",
    items: [
      "System Design",
      "Microservices Architecture",
      "Data Structures & Algorithms",
      "Agile/Scrum",
    ],
  },
] as const;

// ─── Experience ──────────────────────────────────────────────────────────────

export type ExperienceEntry = {
  role: string;
  company: string;
  location: string;
  period: string;
  type: "Full-time" | "Part-time" | "Internship";
  mode: "Hybrid" | "On-Site" | "Remote";
  note?: string;
  highlights: string[];
  skills: string[];
};

export const EXPERIENCE: ExperienceEntry[] = [
  {
    role: "AI Full Stack Developer",
    company: "NS Developer",
    location: "Vehari, Pakistan",
    period: "Apr 2026 – Present",
    type: "Part-time",
    mode: "Hybrid",
    highlights: [
      "Architecting and developing a full-stack AI-powered job portal platform, with sole ownership of the frontend (Next.js) and backend (Node.js, PostgreSQL, Strapi CMS).",
      "Built an AI Resume Analyzer using RAG pipelines and OpenAI APIs, providing automated, context-aware feedback for both job seekers and recruiters.",
      "Developed an AI Chatbot with integrated Resume Builder, enabling users to generate and iteratively refine resumes through natural language interaction.",
      "Engineered a Career Intelligence module featuring intelligent job filtering and personalized skills gap analysis.",
      "Integrated Stripe payment gateway with tiered subscription plans.",
      "Managed end-to-end project delivery, including requirements gathering, system design, development, production deployment, and client handoff.",
    ],
    skills: [
      "Next.js",
      "Node.js",
      "PostgreSQL",
      "Strapi CMS",
      "OpenAI",
      "RAG",
      "LangChain",
      "Stripe",
    ],
  },
  {
    role: "Full Stack Developer",
    company: "AccellionX",
    location: "Lahore, Pakistan",
    period: "Nov 2025 – May 2026",
    type: "Full-time",
    mode: "Hybrid",
    highlights: [
      "Led full-stack development of a scalable SaaS CRM platform using Next.js, TypeScript, Convex, PostgreSQL, Redis, and MongoDB.",
      "Built AI-powered features and agent-based automation workflows using LangChain, LangGraph, and OpenAI APIs.",
      "Architected real-time video, audio, and chat systems using WebSockets and WebRTC.",
      "Automated business workflows with n8n.",
      "Implemented role-based authentication and authorization using Clerk and JWT.",
      "Optimized backend performance with Redis caching and API-driven architecture.",
      "Deployed production infrastructure on AWS EC2 with Nginx, PM2, and GitHub Actions CI/CD.",
    ],
    skills: [
      "Next.js",
      "TypeScript",
      "Convex",
      "PostgreSQL",
      "Redis",
      "MongoDB",
      "LangChain",
      "LangGraph",
      "WebRTC",
      "Clerk",
      "AWS",
      "Docker",
    ],
  },
  {
    role: "Full Stack Developer",
    company: "SpiralSols",
    location: "Multan, Pakistan",
    period: "May 2025 – Nov 2025",
    type: "Full-time",
    mode: "On-Site",
    highlights: [
      "Spearheaded development of scalable full-stack applications using Next.js, TypeScript, Convex, PostgreSQL, and Redis.",
      "Designed and integrated a Stripe subscription system with tiered pricing and usage limits.",
      "Built real-time communication features using WebSockets, WebRTC, and Twilio.",
      "Implemented multi-role authentication with Clerk.",
      "Integrated Facebook, LinkedIn, and OpenAI APIs.",
      "Optimized Amazon S3 media storage and participated in architecture reviews.",
    ],
    skills: [
      "Next.js",
      "TypeScript",
      "Convex",
      "PostgreSQL",
      "Redis",
      "Stripe",
      "WebRTC",
      "Twilio",
      "Clerk",
    ],
  },
  {
    role: "Associate Software Engineer",
    company: "TechSol Hub",
    location: "Vehari, Pakistan",
    period: "Nov 2024 – May 2025",
    type: "Full-time",
    mode: "Hybrid",
    note: "Promoted from Web Developer Intern (Jan 2025)",
    highlights: [
      "Developed and maintained full-stack MERN applications.",
      "Designed RESTful APIs with JWT authentication and role-based middleware.",
      "Managed application state using Redux Toolkit and TanStack Query.",
      "Built drag-and-drop interfaces (React DnD) and rich-text editors.",
      "Improved UI responsiveness using Tailwind CSS.",
      "Participated in code reviews, sprint planning, and Agile ceremonies.",
    ],
    skills: [
      "React",
      "Node.js",
      "MongoDB",
      "Express",
      "Redux Toolkit",
      "TanStack Query",
      "Tailwind CSS",
    ],
  },
  {
    role: "Web Developer Intern",
    company: "Enigmatix",
    location: "Bahawalpur, Pakistan",
    period: "Sep 2024 – Nov 2024",
    type: "Internship",
    mode: "On-Site",
    highlights: [
      "Applied component-based architecture in React.js.",
      "Built responsive layouts with Bootstrap.",
      "Connected frontend interfaces to Node.js/Express.js backends.",
      "Learned REST API design, middleware, and server-side routing.",
    ],
    skills: ["React", "Node.js", "Express", "Bootstrap"],
  },
  {
    role: "Front End Web Developer Intern",
    company: "Enigmatix",
    location: "Bahawalpur, Pakistan",
    period: "Jul 2022 – Nov 2022",
    type: "Internship",
    mode: "On-Site",
    highlights: [
      "Built responsive web pages using HTML, CSS, and JavaScript.",
      "Practiced DOM manipulation and responsive design.",
      "Strengthened core frontend development fundamentals.",
    ],
    skills: ["HTML", "CSS", "JavaScript"],
  },
] as const;

// ─── Projects ────────────────────────────────────────────────────────────────

export type ProjectEntry = {
  title: string;
  description: string;
  tech: string[];
  url: string;
  category: string;
};

export const PROJECTS: ProjectEntry[] = [
  {
    title: "DevOS Portfolio",
    description:
      "Interactive Web OS portfolio with window management, themes, widgets, and AI chat assistant.",
    tech: ["Next.js", "TypeScript", "Framer Motion", "Zustand"],
    url: "https://github.com/SaADii09",
    category: "Personal",
  },
  {
    title: "AI Job Portal",
    description:
      "Full-stack AI-powered job platform with resume analyzer, chatbot, and career intelligence.",
    tech: ["Next.js", "Node.js", "PostgreSQL", "LangChain", "OpenAI"],
    url: "https://github.com/SaADii09",
    category: "AI / SaaS",
  },
  {
    title: "SaaS CRM Platform",
    description:
      "Scalable CRM with AI features, real-time video/audio chat, and automated workflows.",
    tech: ["Next.js", "Convex", "WebRTC", "Redis", "MongoDB"],
    url: "https://github.com/SaADii09",
    category: "SaaS",
  },
  {
    title: "API Automation Toolkit",
    description:
      "Workflow automation platform with n8n integration and multi-step pipeline builder.",
    tech: ["Node.js", "n8n", "Redis", "PostgreSQL"],
    url: "https://github.com/SaADii09",
    category: "Automation",
  },
] as const;

// ─── Education ───────────────────────────────────────────────────────────────

export type EducationEntry = {
  degree: string;
  field: string;
  institution: string;
  location: string;
  graduationDate: string;
};

export const EDUCATION: EducationEntry[] = [
  {
    degree: "Bachelor of Science",
    field: "Computer Science",
    institution: "COMSATS University Islamabad, Vehari Campus",
    location: "Vehari, Pakistan",
    graduationDate: "July 2024",
  },
];

// ─── Certifications ──────────────────────────────────────────────────────────

export type CertificationEntry = {
  name: string;
  issuer: string;
  date: string;
};

export const CERTIFICATIONS: CertificationEntry[] = [
  {
    name: "Career Essentials in Generative AI",
    issuer: "Microsoft & LinkedIn",
    date: "July 2023",
  },
];

// ─── Quick-Access Skill Tags (for AboutApp hero) ────────────────────────────

export const TOP_SKILLS = [
  "Next.js",
  "React",
  "TypeScript",
  "Node.js",
  "PostgreSQL",
  "LangChain",
  "RAG",
  "Docker",
];

import React, { useState, useRef, useEffect } from "react";
import { GoogleGenAI } from "@google/genai";
import { Send, Bot, User, Loader2, Sparkles } from "lucide-react";
import { cn } from "../lib/utils";
import { OKPDCode, ChatMessage } from "../types";
import { motion, AnimatePresence } from "motion/react";

interface AIConsultantProps {
  selectedCode?: OKPDCode;
}

export function AIConsultant({ selectedCode }: AIConsultantProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: selectedCode 
        ? `Здравствуйте! Я ваш ИИ-консультант по закупкам. Вы выбрали код ${selectedCode.code}. Чем я могу помочь вам в контексте этого кода?`
        : "Здравствуйте! Я ваш ИИ-консультант по закупкам. Выберите код ОКПД 2 или задайте общий вопрос по правилам закупок."
    }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
      const model = "gemini-3-flash-preview";
      
      const systemInstruction = `Вы — профессиональный консультант по государственным закупкам в РФ (44-ФЗ и 223-ФЗ). 
      Ваша задача — помогать пользователям разбираться в особенностях закупок по кодам ОКПД 2 и работе на торговых площадках (ЭТП).
      
      Знания о площадках:
      - ТОП-8 федеральных ЭТП: Сбербанк-АСТ, РТС-тендер, Росэлторг, ЭТП ГПБ, ТЭК-Торг, Заказ РФ, РАД, Фабрикант.
      - Типовые контракты теперь называются "Типовые условия контрактов" и хранятся в ЕИС (zakupki.gov.ru).
      - Площадки автоматически подтягивают эти условия из ЕИС при создании извещения.
      
      ${selectedCode ? `Текущий выбранный код: ${selectedCode.code} (${selectedCode.name}). 
      Особенности этого кода: ${JSON.stringify(selectedCode.features)}.` : ""}
      
      Отвечайте четко, ссылаясь на нормативные акты. Если пользователь спрашивает про шаблоны на конкретной площадке, объясните, что основные шаблоны (типовые условия) едины для всех и берутся из ЕИС, но у площадок могут быть свои дополнительные формы в разделе "База знаний".`;

      const response = await ai.models.generateContent({
        model,
        contents: [
          { role: 'user', parts: [{ text: userMessage }] }
        ],
        config: {
          systemInstruction,
          temperature: 0.7,
        }
      });

      const aiResponse = response.text || "Извините, я не смог обработать ваш запрос.";
      setMessages(prev => [...prev, { role: 'assistant', content: aiResponse }]);
    } catch (error) {
      console.error("AI Error:", error);
      setMessages(prev => [...prev, { role: 'assistant', content: "Произошла ошибка при обращении к ИИ. Пожалуйста, попробуйте позже." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[500px] bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 bg-slate-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-600 rounded-lg">
            <Bot className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 text-sm">ИИ-Консультант</h3>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Эксперт по 44-ФЗ и 223-ФЗ</p>
          </div>
        </div>
        <Sparkles className="h-4 w-4 text-blue-500" />
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/30">
        {messages.map((msg, i) => (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            key={i}
            className={cn(
              "flex gap-3 max-w-[85%]",
              msg.role === 'user' ? "ml-auto flex-row-reverse" : "mr-auto"
            )}
          >
            <div className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
              msg.role === 'user' ? "bg-blue-100 text-blue-600" : "bg-white border border-gray-100 text-gray-600 shadow-sm"
            )}>
              {msg.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
            </div>
            <div className={cn(
              "px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm",
              msg.role === 'user' 
                ? "bg-blue-600 text-white rounded-tr-none" 
                : "bg-white text-gray-700 border border-gray-100 rounded-tl-none"
            )}>
              {msg.content}
            </div>
          </motion.div>
        ))}
        {isLoading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-white border border-gray-100 flex items-center justify-center shadow-sm">
              <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
            </div>
            <div className="px-4 py-2.5 rounded-2xl bg-white border border-gray-100 rounded-tl-none shadow-sm">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" />
                <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce [animation-delay:0.2s]" />
                <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce [animation-delay:0.4s]" />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-white border-t border-gray-100">
        <div className="relative flex items-center">
          <input
            type="text"
            className="w-full pl-4 pr-12 py-3 bg-slate-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            placeholder="Задайте вопрос эксперту..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="absolute right-2 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

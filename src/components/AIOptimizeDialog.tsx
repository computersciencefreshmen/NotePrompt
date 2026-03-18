'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { getAvailableProviders, getProviderModels } from '@/config/ai';
import { optimizePromptStream } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Brain, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';

interface AIOptimizeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  originalPrompt: string;
  onOptimized: (optimizedPrompt: string) => void;
}

export function AIOptimizeDialog({ open, onOpenChange, originalPrompt, onOptimized }: AIOptimizeDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [optimizedPrompt, setOptimizedPrompt] = useState('');
  const [thinkingContent, setThinkingContent] = useState('');
  const [showThinking, setShowThinking] = useState(true);
  const [streamingPhase, setStreamingPhase] = useState<'idle' | 'thinking' | 'generating' | 'done'>('idle');
  const [selectedProvider, setSelectedProvider] = useState<string>('qwen');
  const [selectedModel, setSelectedModel] = useState<string>('qwen3.5-plus');
  const { toast } = useToast();

  const thinkingRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  // 获取可用的AI提供商
  const providers = getAvailableProviders();
  
  // 获取当前选择提供商的所有模型
  const models = getProviderModels(selectedProvider);

  // 当提供商改变时，重置模型选择
  const handleProviderChange = (provider: string) => {
    setSelectedProvider(provider);
    const providerModels = getProviderModels(provider);
    if (providerModels.length > 0) {
      setSelectedModel(providerModels[0].key);
    }
  };

  // 自动滚动思考区域到底部
  useEffect(() => {
    if (thinkingRef.current && showThinking) {
      thinkingRef.current.scrollTop = thinkingRef.current.scrollHeight;
    }
  }, [thinkingContent, showThinking]);

  // 自动滚动内容区域到底部
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [optimizedPrompt]);

  const handleOptimize = useCallback(async () => {
    if (!originalPrompt.trim()) {
      toast({ title: '错误', description: '请输入需要优化的提示词', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    setOptimizedPrompt('');
    setThinkingContent('');
    setStreamingPhase('idle');

    await optimizePromptStream(
      { prompt: originalPrompt, provider: selectedProvider, model: selectedModel },
      {
        onThinking: (chunk) => {
          setStreamingPhase('thinking');
          setThinkingContent((prev) => prev + chunk);
        },
        onContent: (chunk) => {
          setStreamingPhase('generating');
          setOptimizedPrompt((prev) => prev + chunk);
        },
        onDone: (result) => {
          setStreamingPhase('done');
          setIsLoading(false);
          // 使用后处理后的完整内容替换流式内容
          if (result.optimized) {
            setOptimizedPrompt(result.optimized);
          }
          toast({
            title: '优化成功',
            description: `耗时 ${result.processing_time}s · ${result.provider}/${result.model}`,
          });
        },
        onError: (message) => {
          setStreamingPhase('idle');
          setIsLoading(false);
          toast({ title: '优化失败', description: message, variant: 'destructive' });
        },
      }
    );
  }, [originalPrompt, selectedProvider, selectedModel, toast]);

  const handleApply = () => {
    if (optimizedPrompt.trim()) {
      onOptimized(optimizedPrompt);
      onOpenChange(false);
      setOptimizedPrompt('');
      setThinkingContent('');
      setStreamingPhase('idle');
    }
  };

  const phaseLabel = streamingPhase === 'thinking'
    ? 'AI 正在思考分析...'
    : streamingPhase === 'generating'
      ? 'AI 正在生成优化结果...'
      : streamingPhase === 'done'
        ? '优化完成'
        : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>AI提示词优化</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* 原始提示词 */}
          <div className="space-y-2">
            <Label htmlFor="original-prompt">原始提示词</Label>
            <Textarea
              id="original-prompt"
              value={originalPrompt}
              readOnly
              className="min-h-[100px]"
            />
          </div>

          {/* AI模型选择 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="provider-select">AI提供商</Label>
              <Select value={selectedProvider} onValueChange={handleProviderChange}>
                <SelectTrigger id="provider-select">
                  <SelectValue placeholder="选择AI提供商" />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((provider) => (
                    <SelectItem key={provider.key} value={provider.key}>
                      {provider.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="model-select">具体模型</Label>
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger id="model-select">
                  <SelectValue placeholder="选择具体模型" />
                </SelectTrigger>
                <SelectContent>
                  {models.map((model) => (
                    <SelectItem key={model.key} value={model.key}>
                      {model.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 优化按钮 + 状态指示 */}
          <div className="flex flex-col items-center gap-2">
            <Button 
              onClick={handleOptimize} 
              disabled={isLoading}
              className="w-full max-w-xs"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 animate-spin" />
                  {phaseLabel}
                </span>
              ) : '开始优化'}
            </Button>
          </div>

          {/* AI思考过程面板 */}
          {thinkingContent && (
            <div className="rounded-lg border border-purple-200 bg-purple-50/50 dark:border-purple-800 dark:bg-purple-950/30">
              <button
                type="button"
                onClick={() => setShowThinking((v) => !v)}
                className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-medium text-purple-700 dark:text-purple-300 hover:bg-purple-100/50 dark:hover:bg-purple-900/30 rounded-t-lg transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Brain className="h-4 w-4" />
                  AI 思考过程
                  {streamingPhase === 'thinking' && (
                    <span className="inline-block h-2 w-2 rounded-full bg-purple-500 animate-pulse" />
                  )}
                </span>
                {showThinking ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {showThinking && (
                <div
                  ref={thinkingRef}
                  className="max-h-[200px] overflow-y-auto px-4 pb-3 text-sm text-purple-600 dark:text-purple-400 whitespace-pre-wrap leading-relaxed"
                >
                  {thinkingContent}
                </div>
              )}
            </div>
          )}

          {/* 流式优化结果 */}
          {(optimizedPrompt || streamingPhase === 'generating') && (
            <div className="space-y-2">
              <Label htmlFor="optimized-prompt" className="flex items-center gap-2">
                优化结果
                {streamingPhase === 'generating' && (
                  <span className="inline-block h-2 w-2 rounded-full bg-teal-500 animate-pulse" />
                )}
              </Label>
              <Textarea
                ref={contentRef}
                id="optimized-prompt"
                value={optimizedPrompt}
                readOnly
                className="min-h-[200px]"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleApply} disabled={!optimizedPrompt.trim() || isLoading}>
            应用优化结果
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

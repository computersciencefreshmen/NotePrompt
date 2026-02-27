'use client'

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { getAvailableProviders, getProviderModels } from '@/config/ai';
import { api, optimizePrompt } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

interface AIOptimizeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  originalPrompt: string;
  onOptimized: (optimizedPrompt: string) => void;
}

export function AIOptimizeDialog({ open, onOpenChange, originalPrompt, onOptimized }: AIOptimizeDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [optimizedPrompt, setOptimizedPrompt] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<string>('qwen');
  const [selectedModel, setSelectedModel] = useState<string>('qwen3.5-plus');
  const { toast } = useToast();

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

  const handleOptimize = async () => {
    if (!originalPrompt.trim()) {
      toast({
        title: "错误",
        description: "请输入需要优化的提示词",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await optimizePrompt({
        prompt: originalPrompt,
        provider: selectedProvider,
        model: selectedModel,
      });

      if (response.success) {
        setOptimizedPrompt(response.optimized || '');
        toast({
          title: "优化成功",
          description: "提示词已成功优化",
        });
      } else {
        toast({
          title: "优化失败",
          description: response.error || "未知错误",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('AI优化失败:', error);
      toast({
        title: "优化失败",
        description: "网络错误或服务不可用",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleApply = () => {
    if (optimizedPrompt.trim()) {
      onOptimized(optimizedPrompt);
      onOpenChange(false);
      setOptimizedPrompt('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>AI提示词优化</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* 原始提示词 */}
          <div className="space-y-2">
            <Label htmlFor="original-prompt">原始提示词</Label>
            <Textarea
              id="original-prompt"
              value={originalPrompt}
              readOnly
              className="min-h-[120px]"
            />
          </div>

          {/* AI模型选择 */}
          <div className="grid grid-cols-2 gap-4">
            {/* 提供商选择 */}
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

            {/* 具体模型选择 */}
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

          {/* 优化按钮 */}
          <div className="flex justify-center">
            <Button 
              onClick={handleOptimize} 
              disabled={isLoading}
              className="w-full max-w-xs"
            >
              {isLoading ? "优化中..." : "开始优化"}
            </Button>
          </div>

          {/* 优化结果 */}
          {optimizedPrompt && (
            <div className="space-y-2">
              <Label htmlFor="optimized-prompt">优化结果</Label>
              <Textarea
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
          <Button onClick={handleApply} disabled={!optimizedPrompt.trim()}>
            应用优化结果
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

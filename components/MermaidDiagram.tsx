
import React, { useEffect, useRef, useState, useCallback } from 'react';
import mermaid from 'mermaid';

// 初始化 mermaid 配置
mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
  fontFamily: 'ui-sans-serif, system-ui, sans-serif',
});

interface MermaidDiagramProps {
  chart: string;
}

const MermaidDiagram: React.FC<MermaidDiagramProps> = ({ chart }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isZoomed, setIsZoomed] = useState(false);
  const [scale, setScale] = useState(1.5); // 默认放大 1.5 倍

  const MIN_SCALE = 0.5;
  const MAX_SCALE = 4;
  const SCALE_STEP = 0.25;

  useEffect(() => {
    const renderChart = async () => {
      if (!chart || !containerRef.current) return;

      try {
        // 生成唯一 ID
        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
        const { svg } = await mermaid.render(id, chart);
        setSvg(svg);
        setError('');
      } catch (err) {
        console.error('Mermaid render error:', err);
        setError(err instanceof Error ? err.message : 'Failed to render diagram');
        setSvg('');
      }
    };

    renderChart();
  }, [chart]);

  // ESC 键关闭 Modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isZoomed) {
        setIsZoomed(false);
      }
    };

    if (isZoomed) {
      document.addEventListener('keydown', handleKeyDown);
      // 防止背景滚动
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isZoomed]);

  const handleOpenModal = useCallback(() => {
    setIsZoomed(true);
    setScale(1.5); // 打开时重置为默认缩放
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsZoomed(false);
  }, []);

  const handleZoomIn = useCallback(() => {
    setScale(prev => Math.min(prev + SCALE_STEP, MAX_SCALE));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale(prev => Math.max(prev - SCALE_STEP, MIN_SCALE));
  }, []);

  const handleResetZoom = useCallback(() => {
    setScale(1.5);
  }, []);

  // 阻止点击内容区域时关闭 Modal
  const handleContentClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  // 鼠标滚轮缩放
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      setScale(prev => Math.min(prev + SCALE_STEP, MAX_SCALE));
    } else {
      setScale(prev => Math.max(prev - SCALE_STEP, MIN_SCALE));
    }
  }, []);

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-600">
        <div className="font-semibold mb-1">Mermaid Error</div>
        <div className="font-mono text-xs">{error}</div>
        <pre className="mt-2 bg-gray-100 p-2 rounded text-xs text-gray-600 overflow-x-auto">
          {chart}
        </pre>
      </div>
    );
  }

  return (
    <>
      {/* 原始图表 - 可点击放大 */}
      <div
        ref={containerRef}
        onClick={handleOpenModal}
        className="mermaid-container bg-white rounded-lg p-4 overflow-x-auto flex justify-center cursor-zoom-in hover:opacity-80 transition-opacity"
        dangerouslySetInnerHTML={{ __html: svg }}
        title="点击放大查看"
      />

      {/* 全屏缩放 Modal */}
      {isZoomed && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center"
          onClick={handleCloseModal}
        >
          {/* 顶部工具栏 */}
          <div
            className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2"
            onClick={handleContentClick}
          >
            {/* 缩小按钮 */}
            <button
              onClick={handleZoomOut}
              disabled={scale <= MIN_SCALE}
              className="text-white/80 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="缩小"
              title="缩小 (滚轮下)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                <line x1="8" y1="11" x2="14" y2="11"></line>
              </svg>
            </button>

            {/* 缩放比例显示 */}
            <button
              onClick={handleResetZoom}
              className="text-white text-sm font-medium min-w-[60px] hover:bg-white/10 px-2 py-1 rounded transition-colors"
              title="点击重置为 150%"
            >
              {Math.round(scale * 100)}%
            </button>

            {/* 放大按钮 */}
            <button
              onClick={handleZoomIn}
              disabled={scale >= MAX_SCALE}
              className="text-white/80 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="放大"
              title="放大 (滚轮上)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                <line x1="11" y1="8" x2="11" y2="14"></line>
                <line x1="8" y1="11" x2="14" y2="11"></line>
              </svg>
            </button>

            <div className="w-px h-6 bg-white/20 mx-1" />

            {/* 关闭按钮 */}
            <button
              onClick={handleCloseModal}
              className="text-white/80 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors"
              aria-label="关闭"
              title="关闭 (ESC)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>

          {/* 图表内容 - 可滚动区域 */}
          <div
            onClick={handleContentClick}
            onWheel={handleWheel}
            className="overflow-auto rounded-xl shadow-2xl cursor-default"
            style={{
              maxWidth: '95vw',
              maxHeight: '85vh',
              marginTop: '60px',
            }}
          >
            <div
              className="mermaid-zoomed bg-white p-8 transition-all duration-150"
              style={{
                // 使用 zoom 而不是 transform，这样容器会随内容大小变化
                zoom: scale,
                minWidth: 'max-content',
                minHeight: 'max-content',
              }}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </div>

          {/* 底部提示 */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/50 text-xs">
            滚轮缩放 · ESC 关闭 · 点击背景关闭
          </div>
        </div>
      )}
    </>
  );
};

export default MermaidDiagram;

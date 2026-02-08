import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus,
  Trash2,
  Zap,
  FolderOpen,
  Search,
  Link,
  Upload,
  Download,
  X,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  ExternalLink,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import {
  skillList,
  skillGetContent,
  skillGetMetadata,
  skillListFiles,
  skillReadFile,
  skillInstallFromContent,
  skillInstallFromUrl,
  skillInstallFromZip,
  skillDelete,
  skillOpenFolder,
  skillSearch,
  SkillInfo,
  SkillMetadata,
  SkillFileItem,
  SearchSkill,
} from '../lib/tauri-api';

type InstallMode = 'search' | 'url' | 'file';

const SkillsManager: React.FC = () => {
  // State
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Install dialog state
  const [showDialog, setShowDialog] = useState(false);
  const [installMode, setInstallMode] = useState<InstallMode>('search');
  const [url, setUrl] = useState('');
  const [installing, setInstalling] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchSkill[]>([]);
  const [searching, setSearching] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Detail view state
  const [selectedSkill, setSelectedSkill] = useState<SkillInfo | null>(null);
  const [skillContent, setSkillContent] = useState<string>('');
  const [skillMetadata, setSkillMetadata] = useState<SkillMetadata | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load skills
  const loadSkills = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await skillList();
      setSkills(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  // Search with debounce
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await skillSearch(searchQuery);
        setSearchResults(results);
      } catch (e) {
        console.error('Search error:', e);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  // Load skill details
  const loadSkillDetails = async (skill: SkillInfo) => {
    try {
      const [content, metadata] = await Promise.all([
        skillGetContent(skill.name),
        skillGetMetadata(skill.name),
      ]);
      setSkillContent(content);
      setSkillMetadata(metadata);
      setSelectedSkill(skill);
    } catch (e) {
      console.error('Failed to load skill details:', e);
    }
  };

  // Install handlers
  const handleInstallFromSearch = async (skill: SearchSkill) => {
    const source = skill.source || skill.slug;
    const skillUrl = `https://github.com/${source}`;

    setInstalling(true);
    try {
      await skillInstallFromUrl(skillUrl);
      setShowDialog(false);
      setSearchQuery('');
      setSearchResults([]);
      loadSkills();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setInstalling(false);
    }
  };

  const handleInstallFromUrl = async () => {
    if (!url.trim()) return;

    setInstalling(true);
    try {
      await skillInstallFromUrl(url.trim());
      setShowDialog(false);
      setUrl('');
      loadSkills();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setInstalling(false);
    }
  };

  const handleFileSelect = async (file: File) => {
    setInstalling(true);
    try {
      if (file.name.endsWith('.zip')) {
        const arrayBuffer = await file.arrayBuffer();
        const base64 = btoa(
          String.fromCharCode(...new Uint8Array(arrayBuffer))
        );
        await skillInstallFromZip(base64, file.name);
      } else {
        const content = await file.text();
        await skillInstallFromContent(content, file.name);
      }
      setShowDialog(false);
      loadSkills();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setInstalling(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);

    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.md') || file.name.endsWith('.zip'))) {
      handleFileSelect(file);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      await skillDelete(deleteTarget);
      setDeleteTarget(null);
      if (selectedSkill?.name === deleteTarget) {
        setSelectedSkill(null);
      }
      loadSkills();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleOpenFolder = async (name: string) => {
    try {
      await skillOpenFolder(name);
    } catch (e) {
      console.error('Failed to open folder:', e);
    }
  };

  // Format token count
  const formatTokenCount = (count: number | null) => {
    if (count === null) return '-';
    if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
    return String(count);
  };

  // Render skill list
  const renderSkillList = () => (
    <div className="space-y-2">
      {skills.map((skill) => (
        <div
          key={skill.name}
          className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors cursor-pointer"
          onClick={() => loadSkillDetails(skill)}
        >
          <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
            <Zap size={20} className="text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-gray-900 dark:text-white truncate">
              {skill.name}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {formatTokenCount(skill.token_count)} tokens
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleOpenFolder(skill.name);
              }}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="Open folder"
            >
              <FolderOpen size={16} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setDeleteTarget(skill.name);
              }}
              className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
              title="Delete"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );

  // Render skill detail view
  const renderSkillDetail = () => {
    if (!selectedSkill) return null;

    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-start gap-4">
          <button
            onClick={() => setSelectedSkill(null)}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <ChevronRight size={20} className="rotate-180" />
          </button>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {selectedSkill.name}
            </h3>
            {skillMetadata?.description && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {skillMetadata.description}
              </p>
            )}
            <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
              <span>{formatTokenCount(selectedSkill.token_count)} tokens</span>
              {skillMetadata?.author && <span>by {skillMetadata.author}</span>}
              {skillMetadata?.installed_at && (
                <span>
                  Installed: {new Date(skillMetadata.installed_at).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleOpenFolder(selectedSkill.name)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <FolderOpen size={16} />
              Open Folder
            </button>
            {skillMetadata?.source && (
              <a
                href={skillMetadata.source}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"
              >
                <ExternalLink size={16} />
                Source
              </a>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4 max-h-96 overflow-y-auto">
          <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono">
            {skillContent}
          </pre>
        </div>
      </div>
    );
  };

  // Render install dialog
  const renderInstallDialog = () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => setShowDialog(false)}
      />
      <div className="relative w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Install Skill
          </h3>
          <button
            onClick={() => setShowDialog(false)}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          {[
            { id: 'search' as InstallMode, label: 'Search', icon: Search },
            { id: 'url' as InstallMode, label: 'URL', icon: Link },
            { id: 'file' as InstallMode, label: 'File', icon: Upload },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setInstallMode(tab.id)}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                  installMode === tab.id
                    ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400 -mb-px'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="p-6">
          {installMode === 'search' && (
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search skills on skills.sh..."
                  className="w-full pl-10 pr-4 py-2.5 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
                {searching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
                )}
              </div>

              {searchResults.length > 0 && (
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {searchResults.map((skill) => (
                    <div
                      key={skill.slug}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <Zap size={16} className="text-indigo-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {skill.name}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {skill.installs} installs
                        </div>
                      </div>
                      <button
                        onClick={() => handleInstallFromSearch(skill)}
                        disabled={installing}
                        className="p-2 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors disabled:opacity-50"
                      >
                        <Download size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {searchQuery && !searching && searchResults.length === 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                  No skills found for "{searchQuery}"
                </p>
              )}
            </div>
          )}

          {installMode === 'url' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  GitHub URL or direct file URL
                </label>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleInstallFromUrl()}
                  placeholder="https://github.com/user/repo/tree/main/skills/my-skill"
                  className="w-full px-4 py-2.5 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
              <button
                onClick={handleInstallFromUrl}
                disabled={!url.trim() || installing}
                className="w-full py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {installing ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Installing...
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    Install from URL
                  </>
                )}
              </button>
            </div>
          )}

          {installMode === 'file' && (
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                dragActive
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                  : 'border-gray-300 dark:border-gray-600'
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
            >
              <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                Drag & drop a <code>.md</code> or <code>.zip</code> file here
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-500 mb-4">
                or
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={installing}
                className="px-4 py-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"
              >
                Browse Files
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".md,.zip"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(file);
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Render delete confirmation
  const renderDeleteConfirmation = () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => setDeleteTarget(null)}
      />
      <div className="relative w-full max-w-sm bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Delete Skill
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              This action cannot be undone
            </p>
          </div>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Are you sure you want to delete <strong>{deleteTarget}</strong>?
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={() => setDeleteTarget(null)}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">Skills</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Skills are stored in ~/.claude/skills/
          </p>
        </div>
        <button
          onClick={() => setShowDialog(true)}
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"
        >
          <Plus size={16} />
          Add Skill
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-3 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
        </div>
      ) : selectedSkill ? (
        renderSkillDetail()
      ) : skills.length > 0 ? (
        renderSkillList()
      ) : (
        // Empty state
        <div className="text-center py-12">
          <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-3">
            <Zap size={24} className="text-gray-400" />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
            No skills installed
          </p>
          <button
            onClick={() => setShowDialog(true)}
            className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            Install your first skill
          </button>
        </div>
      )}

      {/* Dialogs */}
      {showDialog && renderInstallDialog()}
      {deleteTarget && renderDeleteConfirmation()}
    </div>
  );
};

export default SkillsManager;

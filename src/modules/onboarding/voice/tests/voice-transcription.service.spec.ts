import { Test, TestingModule } from '@nestjs/testing';
import { VoiceTranscriptionService } from '../services/voice-transcription.service';
import { VoiceProvider } from '../enums/voice-onboarding.enums';

// Mock Groq SDK
const mockGroqCreate = jest.fn();
jest.mock('groq-sdk', () => {
  return jest.fn().mockImplementation(() => ({
    audio: {
      transcriptions: {
        create: mockGroqCreate,
      },
    },
  }));
});

describe('VoiceTranscriptionService', () => {
  let service: VoiceTranscriptionService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [VoiceTranscriptionService],
    }).compile();

    module.useLogger(false); // Suppresses logger outputs during tests
    service = module.get<VoiceTranscriptionService>(VoiceTranscriptionService);

    // Mock global fetch for AssemblyAI fallback
    global.fetch = jest.fn();
  });

  afterEach(() => {
    (global.fetch as jest.Mock).mockClear();
  });

  describe('transcribe', () => {
    const mockAudioBuffer = Buffer.from('test-audio');
    const mockFileName = 'test.webm';

    it('should successfully transcribe audio using Groq API', async () => {
      mockGroqCreate.mockResolvedValue({ text: 'This is a test transcript from Groq.' });

      const result = await service.transcribe(mockAudioBuffer, mockFileName);

      expect(mockGroqCreate).toHaveBeenCalled();
      // Groq receives a File-like blob, which SDK handles internally from node Blob
      expect(result).toEqual({
        transcript: 'This is a test transcript from Groq.',
        provider: VoiceProvider.GROQ,
      });
      expect(global.fetch).not.toHaveBeenCalled(); // AssemblyAI fallback should not be called
    });

    it('should fallback to AssemblyAI if Groq throws an error', async () => {
      // Force Groq to fail
      mockGroqCreate.mockRejectedValue(new Error('Groq rate limit exceeded'));

      // Mock AssemblyAI Upload step
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ upload_url: 'https://assembly.ai/upload-123' }),
      });

      // Mock AssemblyAI Transcript Request step
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ id: 'transcript-456' }),
      });

      // Mock AssemblyAI Polling step (simulating polling taking 1 attempt)
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ status: 'completed', text: 'This is a test transcript from AssemblyAI.' }),
      });

      const result = await service.transcribe(mockAudioBuffer, mockFileName);

      expect(mockGroqCreate).toHaveBeenCalled(); // Tried Groq first
      expect(global.fetch).toHaveBeenCalledTimes(3); // Upload, Request, Poll

      expect(result).toEqual({
        transcript: 'This is a test transcript from AssemblyAI.',
        provider: VoiceProvider.ASSEMBLYAI,
      });
    });

    it('should throw an error if BOTH Groq and AssemblyAI APIs fail', async () => {
      // Force Groq to fail
      mockGroqCreate.mockRejectedValue(new Error('Groq rate limit exceeded'));

      // Force AssemblyAI Upload to fail
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(service.transcribe(mockAudioBuffer, mockFileName)).rejects.toThrow(
        'Transcription failed on both providers',
      );

      expect(mockGroqCreate).toHaveBeenCalled();
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should throw AssemblyAI timeout/error if polling fails', async () => {
      // Force Groq to fail
      mockGroqCreate.mockRejectedValue(new Error('Groq failed'));

      // Upload succeeds
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ upload_url: 'https://assembly.ai/upload-123' }),
      });

      // Transcript request succeeds
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ id: 'transcript-456' }),
      });

      // Polling returns error status
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ status: 'error', error: 'Audio unreadable' }),
      });

      await expect(service.transcribe(mockAudioBuffer, mockFileName)).rejects.toThrow(
        'Transcription failed on both providers',
      );
    });
  });
});

import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  ScrollView, 
  Alert, 
  View, 
  Text, 
  TouchableOpacity, 
  Image, 
  FlatList,
  Dimensions,
  Modal,
  Pressable
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';

interface UploadedFile {
  id: string;
  name: string;
  uri: string;
  type: 'image' | 'pdf' | 'document';
  size: number;
  uploadDate: Date;
  mimeType?: string;
}

export default function FilesScreen() {
  const colorScheme = useColorScheme();
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<UploadedFile | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    loadStoredFiles();
    requestPermissions();
  }, []);

  const requestPermissions = async () => {
    // 카메라 권한 요청
    const cameraStatus = await ImagePicker.requestCameraPermissionsAsync();
    if (cameraStatus.status !== 'granted') {
      Alert.alert('권한 필요', '카메라 사용을 위해 권한이 필요합니다.');
    }

    // 갤러리 권한 요청  
    const mediaLibraryStatus = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (mediaLibraryStatus.status !== 'granted') {
      Alert.alert('권한 필요', '갤러리 접근을 위해 권한이 필요합니다.');
    }
  };

  const loadStoredFiles = async () => {
    try {
      const storedFilesJson = await FileSystem.readAsStringAsync(
        `${FileSystem.documentDirectory}uploaded_files.json`
      );
      const storedFiles = JSON.parse(storedFilesJson);
      setUploadedFiles(storedFiles.map((file: any) => ({
        ...file,
        uploadDate: new Date(file.uploadDate)
      })));
    } catch (error) {
      // 파일이 없는 경우 무시
      console.log('저장된 파일 목록이 없습니다');
    }
  };

  const saveFilesToStorage = async (files: UploadedFile[]) => {
    try {
      await FileSystem.writeAsStringAsync(
        `${FileSystem.documentDirectory}uploaded_files.json`,
        JSON.stringify(files)
      );
    } catch (error) {
      console.error('파일 목록 저장 실패:', error);
    }
  };

  const generateFileId = () => {
    return Date.now().toString() + Math.random().toString(36).substr(2, 9);
  };

  const getFileType = (uri: string, mimeType?: string): 'image' | 'pdf' | 'document' => {
    if (mimeType) {
      if (mimeType.startsWith('image/')) return 'image';
      if (mimeType === 'application/pdf') return 'pdf';
    }
    
    const extension = uri.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension || '')) return 'image';
    if (extension === 'pdf') return 'pdf';
    return 'document';
  };

  const getFileSize = async (uri: string): Promise<number> => {
    try {
      const fileInfo = await FileSystem.getInfoAsync(uri);
      return fileInfo.exists ? (fileInfo as any).size || 0 : 0;
    } catch {
      return 0;
    }
  };

  const copyFileToDocuments = async (sourceUri: string, filename: string): Promise<string> => {
    const destinationUri = `${FileSystem.documentDirectory}uploads/${filename}`;
    
    // uploads 디렉토리 생성
    const uploadsDir = `${FileSystem.documentDirectory}uploads/`;
    const dirInfo = await FileSystem.getInfoAsync(uploadsDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(uploadsDir, { intermediates: true });
    }

    await FileSystem.copyAsync({
      from: sourceUri,
      to: destinationUri,
    });

    return destinationUri;
  };

  const pickImageFromGallery = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const filename = `img_${generateFileId()}.${asset.uri.split('.').pop()}`;
        const localUri = await copyFileToDocuments(asset.uri, filename);
        const fileSize = await getFileSize(localUri);

        const newFile: UploadedFile = {
          id: generateFileId(),
          name: filename,
          uri: localUri,
          type: 'image',
          size: fileSize,
          uploadDate: new Date(),
          mimeType: asset.type === 'image' ? 'image/jpeg' : undefined,
        };

        const updatedFiles = [...uploadedFiles, newFile];
        setUploadedFiles(updatedFiles);
        await saveFilesToStorage(updatedFiles);
        
        Alert.alert('성공', '이미지가 업로드되었습니다.');
      }
    } catch (error) {
      Alert.alert('오류', '이미지 선택 중 오류가 발생했습니다.');
      console.error('Gallery pick error:', error);
    }
  };

  const takePhoto = async () => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const filename = `photo_${generateFileId()}.jpg`;
        const localUri = await copyFileToDocuments(asset.uri, filename);
        const fileSize = await getFileSize(localUri);

        const newFile: UploadedFile = {
          id: generateFileId(),
          name: filename,
          uri: localUri,
          type: 'image',
          size: fileSize,
          uploadDate: new Date(),
          mimeType: 'image/jpeg',
        };

        const updatedFiles = [...uploadedFiles, newFile];
        setUploadedFiles(updatedFiles);
        await saveFilesToStorage(updatedFiles);

        Alert.alert('성공', '사진이 업로드되었습니다.');
      }
    } catch (error) {
      Alert.alert('오류', '사진 촬영 중 오류가 발생했습니다.');
      console.error('Camera error:', error);
    }
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const filename = asset.name || `doc_${generateFileId()}.${asset.uri.split('.').pop()}`;
        const localUri = await copyFileToDocuments(asset.uri, filename);
        const fileSize = asset.size || await getFileSize(localUri);

        const newFile: UploadedFile = {
          id: generateFileId(),
          name: filename,
          uri: localUri,
          type: getFileType(asset.uri, asset.mimeType),
          size: fileSize,
          uploadDate: new Date(),
          mimeType: asset.mimeType,
        };

        const updatedFiles = [...uploadedFiles, newFile];
        setUploadedFiles(updatedFiles);
        await saveFilesToStorage(updatedFiles);

        Alert.alert('성공', '문서가 업로드되었습니다.');
      }
    } catch (error) {
      Alert.alert('오류', '문서 선택 중 오류가 발생했습니다.');
      console.error('Document pick error:', error);
    }
  };

  const deleteFile = async (fileId: string) => {
    Alert.alert(
      '파일 삭제',
      '이 파일을 삭제하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              const fileToDelete = uploadedFiles.find(f => f.id === fileId);
              if (fileToDelete) {
                // 실제 파일 삭제
                const fileInfo = await FileSystem.getInfoAsync(fileToDelete.uri);
                if (fileInfo.exists) {
                  await FileSystem.deleteAsync(fileToDelete.uri);
                }

                // 목록에서 제거
                const updatedFiles = uploadedFiles.filter(f => f.id !== fileId);
                setUploadedFiles(updatedFiles);
                await saveFilesToStorage(updatedFiles);
              }
            } catch (error) {
              console.error('File delete error:', error);
              Alert.alert('오류', '파일 삭제 중 오류가 발생했습니다.');
            }
          },
        },
      ]
    );
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'image':
        return 'image-outline';
      case 'pdf':
        return 'document-text-outline';
      default:
        return 'document-outline';
    }
  };

  const renderFileItem = ({ item }: { item: UploadedFile }) => (
    <TouchableOpacity
      style={[styles.fileItem, { backgroundColor: Colors[colorScheme ?? 'light'].background }]}
      onPress={() => {
        setSelectedFile(item);
        setModalVisible(true);
      }}
    >
      <View style={styles.fileInfo}>
        {item.type === 'image' ? (
          <Image source={{ uri: item.uri }} style={styles.thumbnail} />
        ) : (
          <View style={[styles.thumbnail, styles.iconContainer]}>
            <Ionicons
              name={getFileIcon(item.type) as any}
              size={30}
              color={Colors[colorScheme ?? 'light'].tint}
            />
          </View>
        )}
        
        <View style={styles.fileDetails}>
          <Text
            style={[styles.fileName, { color: Colors[colorScheme ?? 'light'].text }]}
            numberOfLines={2}
          >
            {item.name}
          </Text>
          <Text style={[styles.fileSize, { color: Colors[colorScheme ?? 'light'].tabIconDefault }]}>
            {formatFileSize(item.size)} • {item.uploadDate.toLocaleDateString()}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => deleteFile(item.id)}
      >
        <Ionicons name="trash-outline" size={20} color="#ff4444" />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  const renderUploadButtons = () => (
    <View style={styles.uploadSection}>
      <ThemedText style={styles.sectionTitle}>파일 업로드</ThemedText>
      
      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.uploadButton, { backgroundColor: Colors[colorScheme ?? 'light'].tint }]}
          onPress={takePhoto}
        >
          <Ionicons name="camera" size={24} color="white" />
          <Text style={styles.uploadButtonText}>사진 촬영</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.uploadButton, { backgroundColor: Colors[colorScheme ?? 'light'].tint }]}
          onPress={pickImageFromGallery}
        >
          <Ionicons name="images" size={24} color="white" />
          <Text style={styles.uploadButtonText}>갤러리</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.uploadButton, { backgroundColor: Colors[colorScheme ?? 'light'].tint }]}
          onPress={pickDocument}
        >
          <Ionicons name="document" size={24} color="white" />
          <Text style={styles.uploadButtonText}>문서</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <ThemedView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {renderUploadButtons()}

        <View style={styles.filesSection}>
          <ThemedText style={styles.sectionTitle}>
            업로드된 파일 ({uploadedFiles.length})
          </ThemedText>

          {uploadedFiles.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons
                name="folder-open-outline"
                size={64}
                color={Colors[colorScheme ?? 'light'].tabIconDefault}
              />
              <ThemedText style={styles.emptyText}>
                아직 업로드된 파일이 없습니다.
              </ThemedText>
              <ThemedText style={[styles.emptySubText, { color: Colors[colorScheme ?? 'light'].tabIconDefault }]}>
                위의 버튼을 사용하여 파일을 업로드해보세요.
              </ThemedText>
            </View>
          ) : (
            <FlatList
              data={uploadedFiles}
              renderItem={renderFileItem}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      </ScrollView>

      {/* 파일 상세보기 모달 */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={[styles.modalContent, { backgroundColor: Colors[colorScheme ?? 'light'].background }]}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>파일 상세</ThemedText>
              <Pressable onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors[colorScheme ?? 'light'].text} />
              </Pressable>
            </View>

            {selectedFile && (
              <ScrollView>
                {selectedFile.type === 'image' ? (
                  <Image source={{ uri: selectedFile.uri }} style={styles.previewImage} />
                ) : (
                  <View style={styles.previewPlaceholder}>
                    <Ionicons
                      name={getFileIcon(selectedFile.type) as any}
                      size={80}
                      color={Colors[colorScheme ?? 'light'].tint}
                    />
                  </View>
                )}

                <View style={styles.fileDetails}>
                  <ThemedText style={styles.detailLabel}>파일명</ThemedText>
                  <ThemedText style={styles.detailValue}>{selectedFile.name}</ThemedText>

                  <ThemedText style={styles.detailLabel}>크기</ThemedText>
                  <ThemedText style={styles.detailValue}>{formatFileSize(selectedFile.size)}</ThemedText>

                  <ThemedText style={styles.detailLabel}>업로드 날짜</ThemedText>
                  <ThemedText style={styles.detailValue}>
                    {selectedFile.uploadDate.toLocaleString()}
                  </ThemedText>

                  {selectedFile.mimeType && (
                    <>
                      <ThemedText style={styles.detailLabel}>파일 타입</ThemedText>
                      <ThemedText style={styles.detailValue}>{selectedFile.mimeType}</ThemedText>
                    </>
                  )}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  uploadSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 12,
  },
  uploadButton: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  uploadButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
  },
  filesSection: {
    flex: 1,
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 8,
    borderRadius: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.22,
    shadowRadius: 2.22,
  },
  fileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  thumbnail: {
    width: 50,
    height: 50,
    borderRadius: 8,
    marginRight: 12,
  },
  iconContainer: {
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fileDetails: {
    flex: 1,
  },
  fileName: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  fileSize: {
    fontSize: 12,
  },
  deleteButton: {
    padding: 8,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '500',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubText: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    width: width - 32,
    maxHeight: '80%',
    borderRadius: 16,
    padding: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  previewImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 16,
    resizeMode: 'contain',
  },
  previewPlaceholder: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 14,
  },
});
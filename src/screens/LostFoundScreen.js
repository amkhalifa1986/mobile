import React, { useState, useEffect, useContext } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  ActivityIndicator, 
  FlatList, 
  Modal, 
  ScrollView, 
  Alert,
  Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthContext } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import api, { API_BASE_URL } from '../config/api';
import { Ionicons } from '@expo/vector-icons';
import AdInterstitial from '../components/AdInterstitial';

export default function LostFoundScreen({ navigation }) {
  const { user } = useContext(AuthContext);
  const { t, isRTL } = useLanguage();

  const [activeTab, setActiveTab] = useState(0); // 0 = Lost, 1 = Found
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modals
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [selectedPost, setSelectedPost] = useState(null);
  const [comments, setComments] = useState([]);

  // Create Post Form
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [trainNumber, setTrainNumber] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [postType, setPostType] = useState('0'); // '0' = Lost, '1' = Found
  const [submitting, setSubmitting] = useState(false);

  // Comment Input
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  const fetchPosts = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const res = await api.get(`/api/lost-found?type=${activeTab}`);
      setPosts(res || []);
    } catch (err) {
      console.error(err);
      Alert.alert(t('Error'), 'Failed to load posts.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchPosts();
  }, [activeTab]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchPosts(false);
  };

  const handleOpenDetails = async (post) => {
    try {
      const res = await api.get(`/api/lost-found/${post.id}`);
      setSelectedPost(res);
      setComments(res.comments || []);
      setDetailsModalVisible(true);
    } catch (err) {
      console.error(err);
      Alert.alert(t('Error'), 'Failed to load post details.');
    }
  };

  const handleCreatePost = async () => {
    if (!title.trim() || !description.trim()) {
      Alert.alert(t('Error'), 'Please fill in Title and Description.');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/api/lost-found', {
        title: title.trim(),
        description: description.trim(),
        imageUrl: imageUrl.trim() || null,
        type: parseInt(postType),
        trainNumber: trainNumber.trim() || null,
        contactInfo: contactInfo.trim() || null
      });

      setTitle('');
      setDescription('');
      setImageUrl('');
      setTrainNumber('');
      setContactInfo('');
      setCreateModalVisible(false);

      Alert.alert(t('Success'), 'Report filed successfully!');
      fetchPosts();
    } catch (err) {
      console.error(err);
      Alert.alert(t('Error'), err.response?.data?.message || 'Failed to submit report.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || !selectedPost) return;

    setSubmittingComment(true);
    try {
      await api.post(`/api/lost-found/${selectedPost.id}/comments`, {
        content: newComment.trim()
      });
      setNewComment('');

      // Reload comments
      const res = await api.get(`/api/lost-found/${selectedPost.id}`);
      setComments(res.comments || []);
    } catch (err) {
      console.error(err);
      Alert.alert(t('Error'), 'Failed to add comment.');
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleDeleteComment = (commentId) => {
    Alert.alert(
      t('Delete Comment'),
      'Are you sure you want to delete this comment?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/api/lost-found/comments/${commentId}`);
              setComments(prev => prev.filter(c => c.id !== commentId));
            } catch (err) {
              console.error(err);
              Alert.alert('Error', 'Failed to delete comment.');
            }
          }
        }
      ]
    );
  };

  const handleMarkResolved = (postId) => {
    Alert.alert(
      t('Mark Resolved'),
      'Mark this report as resolved? This will close commenting.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Resolve',
          onPress: async () => {
            try {
              await api.put(`/api/lost-found/${postId}/resolve`);
              setSelectedPost(prev => prev ? { ...prev, status: 'Closed' } : null);
              fetchPosts(false);
              Alert.alert('Success', 'Report marked as resolved.');
            } catch (err) {
              console.error(err);
              Alert.alert('Error', 'Failed to resolve report.');
            }
          }
        }
      ]
    );
  };

  const handleDeletePost = (postId) => {
    Alert.alert(
      t('Delete Report'),
      'Are you sure you want to delete this report?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/api/lost-found/${postId}`);
              setDetailsModalVisible(false);
              setSelectedPost(null);
              fetchPosts();
            } catch (err) {
              console.error(err);
              Alert.alert('Error', 'Failed to delete report.');
            }
          }
        }
      ]
    );
  };

  const resolveImageUrl = (url) => {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    return `${API_BASE_URL}${url}`;
  };

  return (
    <SafeAreaView style={[styles.container, { direction: isRTL ? 'rtl' : 'ltr' }]}>
      <AdInterstitial pageKey="lostFound" />
      <View style={[styles.header, isRTL && { alignItems: 'flex-end' }]}>
        <Text style={[styles.title, isRTL && styles.textRTL]}>{t('lostFound')}</Text>
        <Text style={[styles.subtitle, isRTL && styles.textRTL]}>{t('lostFoundSubtitle')}</Text>
      </View>

      <View style={[styles.tabContainer, isRTL && styles.rowRTL]}>
        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 0 && styles.tabActiveLost, isRTL && styles.rowRTL]} 
          onPress={() => setActiveTab(0)}
        >
          <Ionicons name="help-circle-outline" size={18} color={activeTab === 0 ? '#ef4444' : '#94a3b8'} style={{ marginRight: isRTL ? 0 : 6, marginLeft: isRTL ? 6 : 0 }} />
          <Text style={[styles.tabText, activeTab === 0 && { color: '#ef4444', fontWeight: 'bold' }]}>{t('lost')}</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 1 && styles.tabActiveFound, isRTL && styles.rowRTL]} 
          onPress={() => setActiveTab(1)}
        >
          <Ionicons name="checkmark-circle-outline" size={18} color={activeTab === 1 ? '#10b981' : '#94a3b8'} style={{ marginRight: isRTL ? 0 : 6, marginLeft: isRTL ? 6 : 0 }} />
          <Text style={[styles.tabText, activeTab === 1 && { color: '#10b981', fontWeight: 'bold' }]}>{t('found')}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#6366f1" />
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity style={[styles.postCard, isRTL && styles.rowRTL]} onPress={() => handleOpenDetails(item)}>
              {item.imageUrl ? (
                <Image source={{ uri: resolveImageUrl(item.imageUrl) }} style={styles.postThumbnail} />
              ) : (
                <View style={[styles.iconPlaceholder, { borderColor: item.type === 'Lost' ? '#ef444430' : '#10b98130' }]}>
                  <Ionicons 
                    name={item.type === 'Lost' ? 'help-circle-outline' : 'checkmark-circle-outline'} 
                    size={28} 
                    color={item.type === 'Lost' ? '#ef4444' : '#10b981'} 
                  />
                </View>
              )}
              <View style={[styles.postDetails, { marginLeft: isRTL ? 0 : 12, marginRight: isRTL ? 12 : 0 }]}>
                <View style={[styles.postHeader, isRTL && styles.rowRTL]}>
                  <Text style={[styles.postTitle, isRTL && styles.textRTL]} numberOfLines={1}>{item.title}</Text>
                  {item.status === 'Closed' ? (
                    <Text style={styles.resolvedBadge}>{t('resolved')}</Text>
                  ) : null}
                </View>
                <Text style={[styles.postDesc, isRTL && styles.textRTL]} numberOfLines={2}>{item.description}</Text>
                
                <View style={[styles.postMeta, isRTL && styles.rowRTL]}>
                  {item.trainNumber ? (
                    <View style={[styles.metaItem, isRTL && styles.rowRTL]}>
                      <Ionicons name="train-outline" size={12} color="#64748b" style={{ marginRight: isRTL ? 0 : 4, marginLeft: isRTL ? 4 : 0 }} />
                      <Text style={styles.metaText}>{isRTL ? 'قطار' : 'Train'} {item.trainNumber}</Text>
                    </View>
                  ) : null}
                  <View style={[styles.metaItem, isRTL && styles.rowRTL]}>
                    <Ionicons name="calendar-outline" size={12} color="#64748b" style={{ marginRight: isRTL ? 0 : 4, marginLeft: isRTL ? 4 : 0 }} />
                    <Text style={styles.metaText}>{new Date(item.createdAt).toLocaleDateString()}</Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="search-outline" size={40} color="#475569" />
              <Text style={styles.emptyText}>{isRTL ? 'لا توجد بلاغات هنا.' : 'No reports found here.'}</Text>
            </View>
          }
        />
      )}

      {/* FLOATING ACTION BUTTON */}
      <TouchableOpacity style={styles.fab} onPress={() => setCreateModalVisible(true)}>
        <Ionicons name="add" size={30} color="#fff" />
      </TouchableOpacity>

      {/* CREATE POST MODAL */}
      <Modal visible={createModalVisible} animationType="slide" transparent={false}>
        <SafeAreaView style={[styles.modalContainer, { direction: isRTL ? 'rtl' : 'ltr' }]}>
          <View style={[styles.modalHeader, isRTL && styles.rowRTL]}>
            <Text style={[styles.modalTitle, isRTL && styles.textRTL]}>{t('createPost')}</Text>
            <TouchableOpacity onPress={() => setCreateModalVisible(false)} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.formScroll} contentContainerStyle={styles.formContainer}>
            <View style={styles.card}>
              <Text style={[styles.label, isRTL && styles.textRTL]}>{isRTL ? 'نوع البلاغ *' : 'Report Type *'}</Text>
              <View style={[styles.radioContainer, isRTL && styles.rowRTL]}>
                <TouchableOpacity 
                  style={[styles.radioButton, postType === '0' && styles.radioActiveLost]} 
                  onPress={() => setPostType('0')}
                >
                  <Text style={[styles.radioText, postType === '0' && { color: '#ef4444' }]}>{isRTL ? 'فقدت غرضاً' : 'I Lost an Item'}</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.radioButton, postType === '1' && styles.radioActiveFound]} 
                  onPress={() => setPostType('1')}
                >
                  <Text style={[styles.radioText, postType === '1' && { color: '#10b981' }]}>{isRTL ? 'وجدت غرضاً' : 'I Found an Item'}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.label, isRTL && styles.textRTL]}>{t('title')} *</Text>
                <TextInput style={[styles.input, isRTL && styles.textRTL]} placeholder={isRTL ? 'مثال: محفظة جلدية سوداء' : 'e.g. Black Leather Wallet'} placeholderTextColor="#64748b" value={title} onChangeText={setTitle} />
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.label, isRTL && styles.textRTL]}>{t('description')} *</Text>
                <TextInput 
                  style={[styles.input, styles.textArea, isRTL && styles.textRTL]} 
                  placeholder={isRTL ? 'يرجى تقديم تفاصيل الغرض، رقم المقعد/العربة...' : 'Provide item details, seat/coach info, or contents...'} 
                  placeholderTextColor="#64748b" 
                  multiline 
                  numberOfLines={4}
                  value={description}
                  onChangeText={setDescription}
                />
              </View>

              <View style={[styles.row, isRTL && styles.rowRTL]}>
                <View style={[styles.inputGroup, { flex: 1, marginRight: isRTL ? 0 : 8, marginLeft: isRTL ? 8 : 0 }]}>
                  <Text style={[styles.label, isRTL && styles.textRTL]}>{t('trainNumber')} ({isRTL ? 'اختياري' : 'Opt'})</Text>
                  <TextInput style={[styles.input, isRTL && styles.textRTL]} placeholder="e.g. 903" placeholderTextColor="#64748b" value={trainNumber} onChangeText={setTrainNumber} />
                </View>
                <View style={[styles.inputGroup, { flex: 1, marginLeft: isRTL ? 0 : 8, marginRight: isRTL ? 8 : 0 }]}>
                  <Text style={[styles.label, isRTL && styles.textRTL]}>{t('contactInfo')}</Text>
                  <TextInput style={[styles.input, isRTL && styles.textRTL]} placeholder={isRTL ? 'الهاتف أو البريد' : 'Phone or email'} placeholderTextColor="#64748b" value={contactInfo} onChangeText={setContactInfo} />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.label, isRTL && styles.textRTL]}>{t('imageUrl')}</Text>
                <TextInput style={[styles.input, isRTL && styles.textRTL]} placeholder="https://example.com/item.jpg" placeholderTextColor="#64748b" value={imageUrl} onChangeText={setImageUrl} autoCapitalize="none" />
              </View>
            </View>

            <TouchableOpacity style={styles.submitButton} onPress={handleCreatePost} disabled={submitting}>
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitButtonText}>{isRTL ? 'إرسال البلاغ' : 'Submit Report'}</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* DETAILS VIEW MODAL */}
      <Modal visible={detailsModalVisible} animationType="slide" transparent={false}>
        {selectedPost ? (
          <SafeAreaView style={[styles.modalContainer, { direction: isRTL ? 'rtl' : 'ltr' }]}>
            <View style={[styles.modalHeader, isRTL && styles.rowRTL]}>
              <View style={[styles.rowHeader, isRTL && styles.rowRTL]}>
                <Text style={[styles.modalTitle, isRTL && styles.textRTL]}>{selectedPost.title}</Text>
                <Text style={[styles.typeBadge, { color: selectedPost.type === 'Lost' ? '#ef4444' : '#10b981' }]}>
                  {selectedPost.type === 'Lost' ? t('lost').toUpperCase() : t('found').toUpperCase()}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setDetailsModalVisible(false)} style={styles.closeButton}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.detailsScroll}>
              {selectedPost.imageUrl ? (
                <Image source={{ uri: resolveImageUrl(selectedPost.imageUrl) }} style={styles.detailsImage} />
              ) : null}

              <View style={styles.detailsCard}>
                <View style={[styles.detailsAuthorRow, isRTL && styles.rowRTL]}>
                  <View style={styles.authorIcon}>
                    <Text style={styles.authorInitial}>{(selectedPost.authorName || 'P')[0].toUpperCase()}</Text>
                  </View>
                  <View style={isRTL && { alignItems: 'flex-end', marginRight: 12 }}>
                    <Text style={styles.authorName}>{selectedPost.authorName || 'Passenger'}</Text>
                    <Text style={styles.authorDate}>{new Date(selectedPost.createdAt).toLocaleString()}</Text>
                  </View>
                </View>

                <Text style={[styles.detailsText, isRTL && styles.textRTL]}>{selectedPost.description}</Text>

                <View style={[styles.detailsMetaContainer, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
                  {selectedPost.trainNumber ? (
                    <View style={[styles.metaItem, isRTL && styles.rowRTL]}>
                      <Ionicons name="train-outline" size={16} color="#6366f1" style={{ marginRight: isRTL ? 0 : 8, marginLeft: isRTL ? 8 : 0 }} />
                      <Text style={styles.detailsMetaText}>{isRTL ? 'رقم القطار' : 'Train Number'}: {selectedPost.trainNumber}</Text>
                    </View>
                  ) : null}

                  {selectedPost.contactInfo ? (
                    <View style={[styles.metaItem, isRTL && styles.rowRTL]}>
                      <Ionicons name="call-outline" size={16} color="#10b981" style={{ marginRight: isRTL ? 0 : 8, marginLeft: isRTL ? 8 : 0 }} />
                      <Text style={styles.detailsMetaText}>{isRTL ? 'الاتصال' : 'Contact'}: {selectedPost.contactInfo}</Text>
                    </View>
                  ) : null}

                  <View style={[styles.metaItem, isRTL && styles.rowRTL]}>
                    <Ionicons name="bookmark-outline" size={16} color="#f59e0b" style={{ marginRight: isRTL ? 0 : 8, marginLeft: isRTL ? 8 : 0 }} />
                    <Text style={styles.detailsMetaText}>{isRTL ? 'الحالة' : 'Status'}: {t(selectedPost.status)}</Text>
                  </View>
                </View>

                <View style={[styles.ownerActionsRow, isRTL && styles.rowRTL]}>
                  {user && user.id === selectedPost.authorId && (
                    <>
                      {selectedPost.status !== 'Closed' && (
                        <TouchableOpacity style={[styles.ownerButton, { borderColor: '#10b981' }, isRTL && styles.rowRTL]} onPress={() => handleMarkResolved(selectedPost.id)}>
                          <Ionicons name="checkmark-circle-outline" size={16} color="#10b981" style={{ marginRight: isRTL ? 0 : 6, marginLeft: isRTL ? 6 : 0 }} />
                          <Text style={[styles.ownerButtonText, { color: '#10b981' }]}>{isRTL ? 'تحديد كـ محلول' : 'Mark Resolved'}</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity style={[styles.ownerButton, { borderColor: '#ef4444' }, isRTL && styles.rowRTL]} onPress={() => handleDeletePost(selectedPost.id)}>
                        <Ionicons name="trash-outline" size={16} color="#ef4444" style={{ marginRight: isRTL ? 0 : 6, marginLeft: isRTL ? 6 : 0 }} />
                        <Text style={[styles.ownerButtonText, { color: '#ef4444' }]}>{isRTL ? 'حذف البلاغ' : 'Delete Report'}</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </View>

              <View style={styles.commentsContainer}>
                <Text style={[styles.commentsTitle, isRTL && styles.textRTL]}>{isRTL ? 'التعليقات والأسئلة' : 'Comments & Q&A'}</Text>

                {comments.length === 0 ? (
                  <Text style={[styles.noCommentsText, isRTL && styles.textRTL]}>{isRTL ? 'لا توجد تعليقات بعد. اطرح سؤالاً أدناه.' : 'No comments yet. Ask a question below.'}</Text>
                ) : (
                  comments.map((comment) => (
                    <View key={comment.id} style={[styles.commentRow, isRTL && styles.rowRTL]}>
                      <View style={styles.commentContent}>
                        <View style={[styles.commentHeader, isRTL && styles.rowRTL]}>
                          <Text style={styles.commentAuthor}>{comment.authorName}</Text>
                          <Text style={styles.commentDate}>{new Date(comment.createdAt).toLocaleDateString()}</Text>
                        </View>
                        <Text style={[styles.commentText, isRTL && styles.textRTL]}>{comment.content}</Text>
                      </View>
                      {user && user.id === comment.authorId && (
                        <TouchableOpacity onPress={() => handleDeleteComment(comment.id)} style={styles.commentDelete}>
                          <Ionicons name="trash-outline" size={16} color="#ef4444" />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))
                )}
              </View>
            </ScrollView>

            {selectedPost.status !== 'Closed' ? (
              <View style={[styles.commentInputRow, isRTL && styles.rowRTL]}>
                <TextInput 
                  style={[styles.commentInput, isRTL && styles.textRTL, { marginRight: isRTL ? 0 : 10, marginLeft: isRTL ? 10 : 0 }]} 
                  placeholder={isRTL ? 'اكتب تعليقاً...' : "Ask a question..."} 
                  placeholderTextColor="#64748b" 
                  value={newComment}
                  onChangeText={setNewComment}
                  disabled={submittingComment}
                />
                <TouchableOpacity style={styles.commentSendButton} onPress={handleAddComment} disabled={submittingComment || !newComment.trim()}>
                  {submittingComment ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="send" size={16} color="#fff" />
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.resolvedBannerContainer}>
                <Text style={styles.resolvedBannerText}>{isRTL ? 'هذا البلاغ مغلق/تم حله.' : 'This report is closed/resolved.'}</Text>
              </View>
            )}
          </SafeAreaView>
        ) : null}
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e2d',
  },
  title: {
    fontSize: 24,
    color: '#fff',
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 4,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#12121a',
    borderRadius: 8,
    margin: 16,
    padding: 4,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 6,
    borderRadius: 6,
  },
  tabActiveLost: {
    backgroundColor: '#ef444415',
    borderColor: '#ef444430',
    borderWidth: 1,
  },
  tabActiveFound: {
    backgroundColor: '#10b98115',
    borderColor: '#10b98130',
    borderWidth: 1,
  },
  tabText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 80,
  },
  postCard: {
    flexDirection: 'row',
    backgroundColor: '#12121a',
    borderColor: '#1e1e2d',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    alignItems: 'center',
  },
  postThumbnail: {
    width: 64,
    height: 64,
    borderRadius: 8,
    backgroundColor: '#0a0a0f',
  },
  iconPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a0a0f',
  },
  postDetails: {
    flex: 1,
    marginLeft: 12,
  },
  postHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  postTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
    flex: 1,
    marginRight: 6,
  },
  resolvedBadge: {
    backgroundColor: '#10b98120',
    color: '#10b981',
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  postDesc: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 6,
  },
  postMeta: {
    flexDirection: 'row',
    gap: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    color: '#64748b',
    fontSize: 11,
  },
  fab: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    backgroundColor: '#6366f1',
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e2d',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typeBadge: {
    fontSize: 11,
    fontWeight: '900',
    backgroundColor: 'rgba(120,120,120,0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formScroll: {
    flex: 1,
  },
  formContainer: {
    padding: 16,
  },
  card: {
    backgroundColor: '#12121a',
    borderColor: '#1e1e2d',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  radioContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
    marginTop: 4,
  },
  radioButton: {
    flex: 1,
    backgroundColor: '#0a0a0f',
    borderColor: '#1e1e2d',
    borderWidth: 1,
    borderRadius: 8,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActiveLost: {
    borderColor: '#ef4444',
    backgroundColor: '#ef444410',
  },
  radioActiveFound: {
    borderColor: '#10b981',
    backgroundColor: '#10b98110',
  },
  radioText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600',
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#0a0a0f',
    borderColor: '#1e1e2d',
    borderWidth: 1,
    borderRadius: 8,
    height: 48,
    paddingHorizontal: 12,
    color: '#fff',
    fontSize: 15,
  },
  textArea: {
    height: 90,
    paddingTop: 10,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
  },
  submitButton: {
    backgroundColor: '#6366f1',
    borderRadius: 8,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: '#64748b',
    fontSize: 14,
    marginTop: 8,
  },
  detailsScroll: {
    flex: 1,
  },
  detailsImage: {
    width: '100%',
    height: 220,
    resizeMode: 'contain',
    backgroundColor: '#12121a',
  },
  detailsCard: {
    backgroundColor: '#12121a',
    borderColor: '#1e1e2d',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    margin: 16,
  },
  detailsAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  authorIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  authorInitial: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  authorName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  authorDate: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 2,
  },
  detailsText: {
    color: '#cbd5e1',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 16,
  },
  detailsMetaContainer: {
    borderTopColor: '#1e1e2d',
    borderTopWidth: 1,
    paddingTop: 12,
    gap: 8,
  },
  detailsMetaText: {
    color: '#e2e8f0',
    fontSize: 13,
  },
  ownerActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  ownerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    flex: 1,
    borderWidth: 1,
    borderRadius: 6,
    height: 36,
  },
  ownerButtonText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  commentsContainer: {
    paddingHorizontal: 16,
    marginBottom: 40,
  },
  commentsTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  noCommentsText: {
    color: '#64748b',
    fontSize: 13,
  },
  commentRow: {
    flexDirection: 'row',
    backgroundColor: '#12121a',
    borderColor: '#1e1e2d',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    alignItems: 'center',
  },
  commentContent: {
    flex: 1,
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  commentAuthor: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  commentDate: {
    color: '#64748b',
    fontSize: 10,
  },
  commentText: {
    color: '#cbd5e1',
    fontSize: 13,
    lineHeight: 18,
  },
  commentDelete: {
    padding: 6,
  },
  commentInputRow: {
    flexDirection: 'row',
    padding: 12,
    borderTopColor: '#1e1e2d',
    borderTopWidth: 1,
    backgroundColor: '#0a0a0f',
    alignItems: 'center',
  },
  commentInput: {
    flex: 1,
    backgroundColor: '#12121a',
    borderColor: '#1e1e2d',
    borderWidth: 1,
    borderRadius: 20,
    height: 40,
    paddingHorizontal: 16,
    color: '#fff',
    marginRight: 10,
  },
  commentSendButton: {
    backgroundColor: '#6366f1',
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resolvedBannerContainer: {
    padding: 14,
    borderTopColor: '#1e1e2d',
    borderTopWidth: 1,
    backgroundColor: '#10b98110',
    alignItems: 'center',
  },
  resolvedBannerText: {
    color: '#10b981',
    fontSize: 14,
    fontWeight: 'bold',
  },
});

import { PlusOutlined } from "@ant-design/icons";
import {
  App as AntdApp,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
} from "antd";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/api";
import { useAuth } from "@/auth";
import type { Role, User } from "@/types";

const roleOptions = [
  { value: "viewer", label: "普通用户" },
  { value: "admin", label: "管理员" },
];

function roleTag(role: Role) {
  return role === "admin" ? <Tag color="blue">管理员</Tag> : <Tag>普通用户</Tag>;
}

export default function Members() {
  const { message } = AntdApp.useApp();
  const { user: me } = useAuth();
  const [data, setData] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [addForm] = Form.useForm();
  const [adding, setAdding] = useState(false);

  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [editForm] = Form.useForm();
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.listMembers());
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? "加载成员列表失败");
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    load();
  }, [load]);

  const onAdd = async () => {
    const values = await addForm.validateFields();
    setAdding(true);
    try {
      await api.createMember({
        username: values.username.trim(),
        password: values.password,
        role: values.role,
      });
      message.success("成员添加成功");
      setAddOpen(false);
      addForm.resetFields();
      load();
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? "添加失败");
    } finally {
      setAdding(false);
    }
  };

  const openEdit = (u: User) => {
    setEditTarget(u);
    editForm.setFieldsValue({ role: u.role, is_active: u.is_active, password: "" });
  };

  const onEdit = async () => {
    if (!editTarget) return;
    const values = await editForm.validateFields();
    setEditing(true);
    try {
      await api.updateMember(editTarget.id, {
        role: values.role,
        is_active: values.is_active,
        password: values.password ? values.password : undefined,
      });
      message.success("成员已更新");
      setEditTarget(null);
      load();
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? "更新失败");
    } finally {
      setEditing(false);
    }
  };

  const onDelete = async (u: User) => {
    try {
      await api.deleteMember(u.id);
      message.success(`已删除 ${u.username}`);
      load();
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? "删除失败");
    }
  };

  const columns = [
    { title: "ID", dataIndex: "id", width: 70 },
    {
      title: "用户名",
      dataIndex: "username",
      render: (v: string, r: User) => (
        <Space>
          {v}
          {r.id === me?.id && <Tag color="green">我</Tag>}
        </Space>
      ),
    },
    { title: "角色", dataIndex: "role", render: (v: Role) => roleTag(v) },
    {
      title: "状态",
      dataIndex: "is_active",
      render: (v: boolean) => (v ? <Tag color="success">启用</Tag> : <Tag color="default">停用</Tag>),
    },
    {
      title: "创建时间",
      dataIndex: "created_at",
      render: (v: string) => new Date(v).toLocaleString(),
    },
    {
      title: "操作",
      align: "center" as const,
      render: (_: unknown, r: User) => (
        <Space>
          <Button size="small" onClick={() => openEdit(r)}>
            编辑
          </Button>
          <Popconfirm
            title={`确定删除成员 ${r.username}？`}
            okButtonProps={{ danger: true }}
            disabled={r.id === me?.id}
            onConfirm={() => onDelete(r)}
          >
            <Button size="small" danger disabled={r.id === me?.id}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title="成员管理"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
          添加成员
        </Button>
      }
    >
      <Table<User> rowKey="id" loading={loading} dataSource={data} columns={columns} pagination={{ pageSize: 10 }} />

      <Modal
        title="添加成员"
        open={addOpen}
        onOk={onAdd}
        confirmLoading={adding}
        onCancel={() => setAddOpen(false)}
        okText="添加"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={addForm} layout="vertical" initialValues={{ role: "viewer" }} preserve={false}>
          <Form.Item
            name="username"
            label="用户名"
            rules={[{ required: true, message: "请输入用户名" }, { max: 64 }]}
          >
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: true, message: "请输入密码" }, { min: 6, message: "密码至少 6 位" }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="role" label="角色" rules={[{ required: true }]}>
            <Select options={roleOptions} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`编辑成员 ${editTarget?.username ?? ""}`}
        open={!!editTarget}
        onOk={onEdit}
        confirmLoading={editing}
        onCancel={() => setEditTarget(null)}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={editForm} layout="vertical" preserve={false}>
          <Form.Item name="role" label="角色" rules={[{ required: true }]}>
            <Select options={roleOptions} disabled={editTarget?.id === me?.id} />
          </Form.Item>
          <Form.Item name="is_active" label="启用" valuePropName="checked">
            <Switch disabled={editTarget?.id === me?.id} />
          </Form.Item>
          <Form.Item
            name="password"
            label="重置密码（留空则不修改）"
            rules={[{ min: 6, message: "密码至少 6 位" }]}
          >
            <Input.Password autoComplete="new-password" placeholder="留空保持原密码" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
